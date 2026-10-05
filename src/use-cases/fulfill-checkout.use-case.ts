import { type CheckoutConfig, centsToDecimal } from "../domain/checkout-config.js";
import type { OrderWithItems } from "../domain/entities/order.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { EmailSenderPort } from "../domain/ports/email-sender.port.js";
import type { OrderRepositoryPort } from "../domain/ports/order.repository.port.js";
import type { PaymentCheckoutPort } from "../domain/ports/payment-checkout.port.js";
import { buildCustomerOrderEmail, buildOwnerOrderEmail } from "./order-emails.js";

/**
 * `fulfill_checkout` según https://docs.stripe.com/checkout/fulfillment:
 * - Se llama desde el webhook y desde la página de éxito (puede correr varias veces y en paralelo).
 * - Consulta la sesión en Stripe y solo actúa si `payment_status` es `paid`.
 * - `markPaidIfPending` es atómico: solo una llamada descuenta stock y envía correos.
 */
export class FulfillCheckoutUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentCheckoutPort,
    private readonly email: EmailSenderPort,
    private readonly config: CheckoutConfig,
  ) {}

  async execute(checkoutSessionId: string): Promise<OrderWithItems> {
    const session = await this.payments.retrieveCheckoutSession(checkoutSessionId);
    const order =
      (await this.orders.findByCheckoutSessionId(checkoutSessionId)) ??
      (session.orderId ? await this.orders.findByIdWithItems(session.orderId) : null);
    if (!order) {
      throw new HttpError("Pedido no encontrado para esta sesión de pago", 404, "order_not_found");
    }

    const isPaid = session.paymentStatus === "paid" || session.paymentStatus === "no_payment_required";

    if (isPaid && order.status === "pending") {
      const won = await this.orders.markPaidIfPending(order.id, {
        stripePaymentIntentId: session.paymentIntentId,
        totalAmount:
          session.amountTotalCents !== null ? centsToDecimal(session.amountTotalCents) : order.totalAmount,
        shippingAmount: centsToDecimal(session.shippingAmountCents),
        shippingAddress: order.fulfillmentMethod === "shipping" ? session.shippingAddress : null,
        customerName: session.customerName ?? order.customerName,
        customerEmail: session.customerEmail ?? order.customerEmail,
        customerPhone: session.customerPhone,
      });
      if (won) {
        await this.orders.decrementStock(order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
        const paid = await this.orders.findByIdWithItems(order.id);
        if (paid) await this.sendEmails(paid);
      }
    } else if (!isPaid && session.status === "expired" && order.status === "pending") {
      await this.orders.closeIfPending(order.id, "expired");
    }

    const fresh = await this.orders.findByIdWithItems(order.id);
    if (!fresh) throw new HttpError("Pedido no encontrado", 404, "order_not_found");
    return fresh;
  }

  private async sendEmails(order: OrderWithItems): Promise<void> {
    const from = this.config.fromEmail;
    if (!from) {
      console.warn(`Pedido ${order.id} pagado, pero CONTACT_FROM_EMAIL no está configurado: no se enviaron correos.`);
      return;
    }

    if (this.config.ownerEmail) {
      try {
        const mail = buildOwnerOrderEmail(order, this.config);
        await this.email.sendEmail({
          to: [this.config.ownerEmail],
          from,
          subject: mail.subject,
          text: mail.text,
          ...(order.customerEmail ? { replyTo: order.customerEmail } : {}),
        });
        await this.orders.markEmailSent(order.id, "owner");
      } catch (error) {
        console.error(`No se pudo enviar el aviso de pedido ${order.id}:`, error);
      }
    }

    if (order.customerEmail) {
      try {
        const mail = buildCustomerOrderEmail(order, this.config);
        await this.email.sendEmail({
          to: [order.customerEmail],
          from,
          subject: mail.subject,
          text: mail.text,
          ...(this.config.ownerEmail ? { replyTo: this.config.ownerEmail } : {}),
        });
        await this.orders.markEmailSent(order.id, "customer");
      } catch (error) {
        console.error(`No se pudo enviar la confirmación del pedido ${order.id}:`, error);
      }
    }
  }
}
