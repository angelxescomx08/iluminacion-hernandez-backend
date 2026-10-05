export type OrderStatus = "pending" | "paid" | "canceled" | "expired" | "refunded";
export type FulfillmentMethod = "shipping" | "pickup";

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  productTitle: string | null;
  quantity: number;
  /** Precio unitario en el momento de la compra (string decimal, ej. "639.00"). */
  priceAtPurchase: string | null;
};

export type Order = {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotalAmount: string;
  shippingAmount: string;
  totalAmount: string;
  currency: string;
  fulfillmentMethod: FulfillmentMethod;
  pickupBranch: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  shippingAddress: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  paidAt: Date | null;
  canceledAt: Date | null;
  customerEmailSentAt: Date | null;
  ownerEmailSentAt: Date | null;
  refundedAmount: string;
  refundedAt: Date | null;
  disputeStatus: string | null;
  disputeReason: string | null;
  disputedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type OrderWithItems = Order & { items: OrderItem[] };

/** Número corto y legible para mostrar al cliente y en correos (ej. "A1B2C3D4"). */
export function orderShortCode(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}
