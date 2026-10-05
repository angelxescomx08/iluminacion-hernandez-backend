export type CheckoutLineItem = {
  externalPriceId: string;
  quantity: number;
};

export type CreateCheckoutInput = {
  orderId: string;
  lineItems: CheckoutLineItem[];
  currency: string;
  customerEmail: string;
  /** Si viene, Stripe pide dirección de envío (solo México) y cobra esta tarifa fija. */
  shipping: { amountCents: number; displayName: string } | null;
  successUrl: string;
  cancelUrl: string;
  /** Minutos antes de que Stripe expire la sesión (mínimo 30). */
  expiresInMinutes: number;
};

export type CheckoutSessionSnapshot = {
  id: string;
  url: string | null;
  /** `open` | `complete` | `expired` */
  status: string | null;
  /** `paid` | `unpaid` | `no_payment_required` */
  paymentStatus: string;
  orderId: string | null;
  paymentIntentId: string | null;
  amountTotalCents: number | null;
  shippingAmountCents: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
};

export type CheckoutWebhookEvent = {
  type: string;
  checkoutSessionId: string | null;
  /** PaymentIntent del cargo (eventos `charge.*`). */
  paymentIntentId: string | null;
  /** `charge.refunded`: montos del cargo en centavos. */
  refund: { amountCents: number; amountRefundedCents: number } | null;
  /** `charge.dispute.*`: estado y motivo de la disputa. */
  dispute: { status: string; reason: string | null } | null;
};

export interface PaymentCheckoutPort {
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }>;
  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot>;
  /** `metadata.order_id` del PaymentIntent (para ligar reembolsos/disputas aunque lleguen antes que la confirmación). */
  findOrderIdForPaymentIntent(paymentIntentId: string): Promise<string | null>;
  /** Expira una sesión abierta. No falla si ya estaba expirada o completada. */
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** Verifica la firma del webhook y devuelve el evento; lanza error si no es válida. */
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): CheckoutWebhookEvent;
}
