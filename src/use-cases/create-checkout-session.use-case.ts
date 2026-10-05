import { randomUUID } from "node:crypto";
import { type CheckoutConfig, centsToDecimal, toCents } from "../domain/checkout-config.js";
import type { FulfillmentMethod, Order, OrderItem } from "../domain/entities/order.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { OrderRepositoryPort } from "../domain/ports/order.repository.port.js";
import type { PaymentCheckoutPort } from "../domain/ports/payment-checkout.port.js";
import type { ProductRepositoryPort } from "../domain/ports/product.repository.port.js";

export type CreateCheckoutCommand = {
  userId: string;
  userEmail: string;
  userName: string | null;
  items: unknown;
  fulfillment: unknown;
};

export type CreateCheckoutResult = {
  orderId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
};

type CartLine = { productId: string; quantity: number };

function parseFulfillment(raw: unknown): FulfillmentMethod {
  if (raw === "shipping" || raw === "pickup") return raw;
  throw new HttpError("Elige envío a domicilio o recoger en sucursal", 400, "invalid_fulfillment");
}

function parseItems(raw: unknown, config: CheckoutConfig): CartLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError("El carrito está vacío", 400, "empty_cart");
  }
  const merged = new Map<string, number>();
  for (const entry of raw) {
    const e = entry as Record<string, unknown> | null;
    const productId = typeof e?.productId === "string" ? e.productId.trim() : "";
    const quantity = e?.quantity;
    if (!productId) throw new HttpError("Producto inválido en el carrito", 400, "invalid_item");
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      throw new HttpError("La cantidad debe ser un número entero mayor a 0", 400, "invalid_quantity");
    }
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  }
  if (merged.size > config.maxDistinctItems) {
    throw new HttpError(`Máximo ${config.maxDistinctItems} productos distintos por pedido`, 400, "too_many_items");
  }
  for (const [, qty] of merged) {
    if (qty > config.maxQuantityPerItem) {
      throw new HttpError(`Máximo ${config.maxQuantityPerItem} piezas por producto`, 400, "invalid_quantity");
    }
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

export class CreateCheckoutSessionUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentCheckoutPort,
    private readonly config: CheckoutConfig,
  ) {}

  async execute(command: CreateCheckoutCommand): Promise<CreateCheckoutResult> {
    const fulfillment = parseFulfillment(command.fulfillment);
    const lines = parseItems(command.items, this.config);

    const orderId = randomUUID();
    const items: OrderItem[] = [];
    const lineItems: Array<{ externalPriceId: string; quantity: number }> = [];
    let subtotalCents = 0;

    for (const line of lines) {
      const product = await this.products.findById(line.productId);
      if (!product || !product.isActive) {
        throw new HttpError("Uno de los productos ya no está disponible", 400, "product_unavailable");
      }
      if (!product.stripePriceId) {
        throw new HttpError(`"${product.title}" no se puede comprar en línea`, 409, "product_not_purchasable");
      }
      if (product.stock < line.quantity) {
        throw new HttpError(
          product.stock === 0
            ? `"${product.title}" está agotado`
            : `Solo hay ${product.stock} pieza(s) de "${product.title}"`,
          409,
          "insufficient_stock",
        );
      }
      subtotalCents += toCents(product.price) * line.quantity;
      items.push({
        id: randomUUID(),
        orderId,
        productId: product.id,
        productTitle: product.title,
        quantity: line.quantity,
        priceAtPurchase: product.price,
      });
      lineItems.push({ externalPriceId: product.stripePriceId, quantity: line.quantity });
    }

    const shippingCents = fulfillment === "shipping" ? Math.round(this.config.shippingFlatRate * 100) : 0;
    const now = new Date();
    const order: Order = {
      id: orderId,
      userId: command.userId,
      status: "pending",
      subtotalAmount: centsToDecimal(subtotalCents),
      shippingAmount: centsToDecimal(shippingCents),
      totalAmount: centsToDecimal(subtotalCents + shippingCents),
      currency: this.config.currency,
      fulfillmentMethod: fulfillment,
      pickupBranch: fulfillment === "pickup" ? this.config.pickupBranch.name : null,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: null,
      shippingAddress: null,
      customerName: command.userName,
      customerEmail: command.userEmail,
      customerPhone: null,
      paidAt: null,
      canceledAt: null,
      customerEmailSentAt: null,
      ownerEmailSentAt: null,
      refundedAmount: "0.00",
      refundedAt: null,
      disputeStatus: null,
      disputeReason: null,
      disputedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.orders.insertWithItems(order, items);

    const site = this.config.siteUrl;
    try {
      const session = await this.payments.createCheckoutSession({
        orderId,
        lineItems,
        currency: this.config.currency,
        customerEmail: command.userEmail,
        shipping:
          fulfillment === "shipping"
            ? { amountCents: shippingCents, displayName: "Envío a domicilio" }
            : null,
        successUrl: `${site}/checkout/exito?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${site}/carrito?cancelado=${orderId}`,
        expiresInMinutes: this.config.sessionMinutes,
      });
      await this.orders.attachCheckoutSession(orderId, session.id);
      return { orderId, checkoutSessionId: session.id, checkoutUrl: session.url };
    } catch (error) {
      await this.orders.closeIfPending(orderId, "canceled");
      throw error;
    }
  }
}
