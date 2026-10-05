import { type CheckoutConfig, centsToDecimal } from "../domain/checkout-config.js";
import type { OrderWithItems } from "../domain/entities/order.entity.js";
import type { EmailSenderPort } from "../domain/ports/email-sender.port.js";
import type { OrderRepositoryPort } from "../domain/ports/order.repository.port.js";
import type { PaymentCheckoutPort } from "../domain/ports/payment-checkout.port.js";
import type { FulfillCheckoutUseCase } from "./fulfill-checkout.use-case.js";
import { buildCustomerRefundEmail, buildOwnerDisputeEmail, buildOwnerRefundEmail } from "./order-emails.js";

/**
 * Cambios posteriores al pago que llegan por webhook:
 * - `charge.refunded`: reembolso hecho desde el Dashboard de Stripe (total o parcial).
 * - `charge.dispute.created` / `updated` / `closed`: contracargo del banco del cliente.
 * Ambos son idempotentes: si Stripe reenvía el mismo evento no se regresa stock ni se envían correos dos veces.
 *
 * Stripe no garantiza el orden de los eventos: una disputa puede llegar al mismo tiempo que
 * `checkout.session.completed`, antes de que el pedido tenga guardado su PaymentIntent. Por eso el pedido
 * también se busca por `metadata.order_id` del PaymentIntent y, si sigue `pending`, primero se confirma.
 */
export class HandlePaymentAdjustmentsUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentCheckoutPort,
    private readonly fulfill: FulfillCheckoutUseCase,
    private readonly email: EmailSenderPort,
    private readonly config: CheckoutConfig,
  ) {}

  private async resolveOrder(paymentIntentId: string): Promise<OrderWithItems | null> {
    let order = await this.orders.findByPaymentIntentId(paymentIntentId);
    if (!order) {
      const orderId = await this.payments.findOrderIdForPaymentIntent(paymentIntentId);
      order = orderId ? await this.orders.findByIdWithItems(orderId) : null;
    }
    if (order?.status === "pending" && order.stripeCheckoutSessionId) {
      order = await this.fulfill.execute(order.stripeCheckoutSessionId);
    }
    return order;
  }

  async refund(paymentIntentId: string, amountCents: number, amountRefundedCents: number): Promise<boolean> {
    const order = await this.resolveOrder(paymentIntentId);
    if (!order) return false;

    const fullyRefunded = amountRefundedCents >= amountCents && amountCents > 0;
    const { becameRefunded, amountChanged } = await this.orders.recordRefund(
      order.id,
      centsToDecimal(amountRefundedCents),
      fullyRefunded,
    );

    if (becameRefunded) {
      await this.orders.incrementStock(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
    }
    if (amountChanged) {
      const fresh = await this.orders.findByIdWithItems(order.id);
      if (fresh) {
        await this.send(this.config.ownerEmail, buildOwnerRefundEmail(fresh, fullyRefunded), fresh.customerEmail);
        await this.send(fresh.customerEmail, buildCustomerRefundEmail(fresh, fullyRefunded), this.config.ownerEmail);
      }
    }
    return true;
  }

  async dispute(paymentIntentId: string, status: string, reason: string | null): Promise<boolean> {
    const order = await this.resolveOrder(paymentIntentId);
    if (!order) return false;
    const isNew = await this.orders.recordDispute(order.id, status, reason);
    if (isNew) {
      const fresh = await this.orders.findByIdWithItems(order.id);
      if (fresh) await this.send(this.config.ownerEmail, buildOwnerDisputeEmail(fresh), null);
    }
    return true;
  }

  private async send(to: string | null, mail: { subject: string; text: string }, replyTo: string | null) {
    if (!to || !this.config.fromEmail) return;
    try {
      await this.email.sendEmail({
        to: [to],
        from: this.config.fromEmail,
        subject: mail.subject,
        text: mail.text,
        ...(replyTo ? { replyTo } : {}),
      });
    } catch (error) {
      console.error(`No se pudo enviar "${mail.subject}":`, error);
    }
  }
}
