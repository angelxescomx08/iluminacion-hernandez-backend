import { relations } from "drizzle-orm";
import { decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth.tables.js";
import { products } from "./catalog.tables.js";

/**
 * Pedido de la tienda. Ciclo de vida (`status`):
 * - `pending`: Checkout Session creada en Stripe, esperando pago.
 * - `paid`: pago confirmado (webhook o página de éxito); stock descontado y correos enviados.
 * - `canceled`: el cliente regresó desde Stripe sin pagar (la sesión se expira en Stripe).
 * - `expired`: Stripe expiró la sesión sin pago (`checkout.session.expired`).
 * - `refunded`: reembolso total desde Stripe (`charge.refunded`); el stock se regresa.
 * Un reembolso parcial deja el pedido `paid` y solo acumula `refunded_amount`.
 * Un contracargo (disputa) se registra en `dispute_status` sin cambiar `status`.
 */
export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull(),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    subtotalAmount: decimal("subtotal_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    shippingAmount: decimal("shipping_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("mxn"),
    /** `shipping` (envío a domicilio) o `pickup` (recoger en sucursal). */
    fulfillmentMethod: text("fulfillment_method").notNull().default("shipping"),
    pickupBranch: text("pickup_branch"),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    shippingAddress: text("shipping_address"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "date" }),
    customerEmailSentAt: timestamp("customer_email_sent_at", { withTimezone: true, mode: "date" }),
    ownerEmailSentAt: timestamp("owner_email_sent_at", { withTimezone: true, mode: "date" }),
    refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "date" }),
    /** Estado de la disputa en Stripe (`needs_response`, `under_review`, `won`, `lost`, …). */
    disputeStatus: text("dispute_status"),
    disputeReason: text("dispute_reason"),
    disputedAt: timestamp("disputed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
  },
  (t) => [
    index("orders_user_id_idx").on(t.userId),
    index("orders_payment_intent_idx").on(t.stripePaymentIntentId),
  ],
);

export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  /** Título del producto al momento de la compra (por si luego cambia). */
  productTitle: text("product_title"),
  quantity: integer("quantity").notNull(),
  priceAtPurchase: decimal("price_at_purchase", { precision: 10, scale: 2 }),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));
