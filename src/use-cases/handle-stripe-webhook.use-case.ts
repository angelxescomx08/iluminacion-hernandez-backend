import type { PaymentCheckoutPort } from "../domain/ports/payment-checkout.port.js";
import type { FulfillCheckoutUseCase } from "./fulfill-checkout.use-case.js";
import type { HandlePaymentAdjustmentsUseCase } from "./handle-payment-adjustments.use-case.js";

const CHECKOUT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);
const DISPUTE_EVENTS = new Set(["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"]);

/** Eventos que el endpoint del webhook debe tener suscritos en Stripe. */
export const STRIPE_WEBHOOK_EVENTS = [...CHECKOUT_EVENTS, "charge.refunded", ...DISPUTE_EVENTS];

export class HandleStripeWebhookUseCase {
  constructor(
    private readonly payments: PaymentCheckoutPort,
    private readonly fulfill: FulfillCheckoutUseCase,
    private readonly adjustments: HandlePaymentAdjustmentsUseCase,
  ) {}

  /** Lanza HttpError 400 si la firma no es válida. Devuelve el tipo de evento y si se aplicó a un pedido. */
  async execute(rawBody: Buffer, signature: string | undefined): Promise<{ type: string; handled: boolean }> {
    const event = this.payments.parseWebhookEvent(rawBody, signature);

    if (CHECKOUT_EVENTS.has(event.type) && event.checkoutSessionId) {
      try {
        // La función de fulfillment consulta el estado real en Stripe y decide (pagado / expirado / nada).
        await this.fulfill.execute(event.checkoutSessionId);
      } catch (error) {
        // Sesiones creadas fuera de esta tienda (sin pedido local) no deben provocar reintentos infinitos.
        if ((error as { code?: string }).code === "order_not_found") return { type: event.type, handled: false };
        throw error;
      }
      return { type: event.type, handled: true };
    }

    if (event.type === "charge.refunded" && event.paymentIntentId && event.refund) {
      const handled = await this.adjustments.refund(
        event.paymentIntentId,
        event.refund.amountCents,
        event.refund.amountRefundedCents,
      );
      return { type: event.type, handled };
    }

    if (DISPUTE_EVENTS.has(event.type) && event.paymentIntentId && event.dispute) {
      const handled = await this.adjustments.dispute(event.paymentIntentId, event.dispute.status, event.dispute.reason);
      return { type: event.type, handled };
    }

    return { type: event.type, handled: false };
  }
}
