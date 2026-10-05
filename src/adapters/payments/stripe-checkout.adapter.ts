import Stripe from "stripe";
import { HttpError } from "../../domain/errors/http-error.js";
import type {
  CheckoutSessionSnapshot,
  CheckoutWebhookEvent,
  CreateCheckoutInput,
  PaymentCheckoutPort,
} from "../../domain/ports/payment-checkout.port.js";

type AddressLike = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
} | null | undefined;

function formatAddress(name: string | null | undefined, address: AddressLike): string | null {
  if (!address) return null;
  const parts = [
    name ?? null,
    address.line1 ?? null,
    address.line2 ?? null,
    [address.postal_code, address.city].filter(Boolean).join(" ") || null,
    address.state ?? null,
    address.country ?? null,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(", ") : null;
}

/**
 * Adaptador de Stripe Checkout (página alojada por Stripe).
 * Docs: https://docs.stripe.com/checkout/fulfillment y https://docs.stripe.com/payments/during-payment/charge-shipping
 */
export class StripeCheckoutAdapter implements PaymentCheckoutPort {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | null,
  ) {
    this.stripe = new Stripe(secretKey, { typescript: true });
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }> {
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(30, input.expiresInMinutes) * 60;

    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es-419",
      payment_method_types: ["card"],
      line_items: input.lineItems.map((li) => ({ price: li.externalPriceId, quantity: li.quantity })),
      customer_email: input.customerEmail,
      client_reference_id: input.orderId,
      metadata: { order_id: input.orderId },
      payment_intent_data: { metadata: { order_id: input.orderId } },
      phone_number_collection: { enabled: true },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: expiresAt,
      ...(input.shipping
        ? {
            shipping_address_collection: { allowed_countries: ["MX"] },
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  display_name: input.shipping.displayName,
                  fixed_amount: { amount: input.shipping.amountCents, currency: input.currency },
                  delivery_estimate: {
                    minimum: { unit: "business_day", value: 3 },
                    maximum: { unit: "business_day", value: 7 },
                  },
                },
              },
            ],
          }
        : {}),
    });

    if (!session.url) {
      throw new HttpError("Stripe no devolvió la URL de pago", 502, "checkout_without_url");
    }
    return { id: session.id, url: session.url };
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot> {
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new HttpError("Sesión de pago no encontrada", 404, "checkout_not_found");
      }
      throw error;
    }

    // En versiones recientes de la API los datos de envío viven en `collected_information`.
    const s = session as Stripe.Checkout.Session & {
      collected_information?: { shipping_details?: { name?: string | null; address?: AddressLike } | null } | null;
      shipping_details?: { name?: string | null; address?: AddressLike } | null;
    };
    const shipping = s.collected_information?.shipping_details ?? s.shipping_details ?? null;
    const paymentIntent = session.payment_intent;

    return {
      id: session.id,
      url: session.url ?? null,
      status: session.status ?? null,
      paymentStatus: session.payment_status,
      orderId: session.metadata?.order_id ?? session.client_reference_id ?? null,
      paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : (paymentIntent?.id ?? null),
      amountTotalCents: session.amount_total ?? null,
      shippingAmountCents: session.shipping_cost?.amount_total ?? 0,
      customerName: session.customer_details?.name ?? shipping?.name ?? null,
      customerEmail: session.customer_details?.email ?? null,
      customerPhone: session.customer_details?.phone ?? null,
      shippingAddress: formatAddress(shipping?.name, shipping?.address),
    };
  }

  async findOrderIdForPaymentIntent(paymentIntentId: string): Promise<string | null> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return pi.metadata?.order_id ?? null;
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
      throw error;
    }
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      // Si ya estaba expirada o completada, Stripe responde 400; no es un error para nosotros.
      if (error instanceof Stripe.errors.StripeInvalidRequestError) return;
      throw error;
    }
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): CheckoutWebhookEvent {
    if (!this.webhookSecret) {
      throw new HttpError("Webhook de Stripe no configurado", 503, "webhook_not_configured");
    }
    if (!signature) {
      throw new HttpError("Falta la firma de Stripe", 400, "missing_signature");
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new HttpError("Firma de webhook inválida", 400, "invalid_signature");
    }
    const object = event.data.object as {
      object?: string;
      id?: string;
      payment_intent?: string | { id: string } | null;
      amount?: number;
      amount_refunded?: number;
      status?: string;
      reason?: string | null;
    };
    const pi = object?.payment_intent;
    return {
      type: event.type,
      checkoutSessionId: object?.object === "checkout.session" ? (object.id ?? null) : null,
      paymentIntentId: typeof pi === "string" ? pi : (pi?.id ?? null),
      refund:
        object?.object === "charge"
          ? { amountCents: object.amount ?? 0, amountRefundedCents: object.amount_refunded ?? 0 }
          : null,
      dispute:
        object?.object === "dispute" ? { status: object.status ?? "unknown", reason: object.reason ?? null } : null,
    };
  }
}
