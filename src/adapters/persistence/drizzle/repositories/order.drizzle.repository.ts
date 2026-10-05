import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  FulfillmentMethod,
  Order,
  OrderItem,
  OrderStatus,
  OrderWithItems,
} from "../../../../domain/entities/order.entity.js";
import type { OrderRepositoryPort, PaymentDetails } from "../../../../domain/ports/order.repository.port.js";
import type { AppDatabase } from "../../postgres/postgres-database.adapter.js";
import { products } from "../schema/catalog.tables.js";
import { orderItems, orders } from "../schema/orders.tables.js";

function mapOrder(row: typeof orders.$inferSelect): Order {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as OrderStatus,
    subtotalAmount: row.subtotalAmount,
    shippingAmount: row.shippingAmount,
    totalAmount: row.totalAmount,
    currency: row.currency,
    fulfillmentMethod: row.fulfillmentMethod as FulfillmentMethod,
    pickupBranch: row.pickupBranch ?? null,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: row.stripePaymentIntentId ?? null,
    shippingAddress: row.shippingAddress ?? null,
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    customerPhone: row.customerPhone ?? null,
    paidAt: row.paidAt ?? null,
    canceledAt: row.canceledAt ?? null,
    customerEmailSentAt: row.customerEmailSentAt ?? null,
    ownerEmailSentAt: row.ownerEmailSentAt ?? null,
    refundedAmount: row.refundedAmount,
    refundedAt: row.refundedAt ?? null,
    disputeStatus: row.disputeStatus ?? null,
    disputeReason: row.disputeReason ?? null,
    disputedAt: row.disputedAt ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function mapItem(row: typeof orderItems.$inferSelect): OrderItem {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    productTitle: row.productTitle ?? null,
    quantity: row.quantity,
    priceAtPurchase: row.priceAtPurchase ?? null,
  };
}

export class OrderDrizzleRepository implements OrderRepositoryPort {
  constructor(private readonly db: AppDatabase) {}

  async insertWithItems(order: Order, items: OrderItem[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: order.id,
        userId: order.userId,
        status: order.status,
        subtotalAmount: order.subtotalAmount,
        shippingAmount: order.shippingAmount,
        totalAmount: order.totalAmount,
        currency: order.currency,
        fulfillmentMethod: order.fulfillmentMethod,
        pickupBranch: order.pickupBranch,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        createdAt: order.createdAt ?? new Date(),
        updatedAt: order.updatedAt ?? new Date(),
      });
      if (items.length) {
        await tx.insert(orderItems).values(
          items.map((i) => ({
            id: i.id,
            orderId: i.orderId,
            productId: i.productId,
            productTitle: i.productTitle,
            quantity: i.quantity,
            priceAtPurchase: i.priceAtPurchase,
          })),
        );
      }
    });
  }

  async attachCheckoutSession(orderId: string, checkoutSessionId: string): Promise<void> {
    await this.db
      .update(orders)
      .set({ stripeCheckoutSessionId: checkoutSessionId, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  private async withItems(rows: Array<typeof orders.$inferSelect>): Promise<OrderWithItems[]> {
    if (!rows.length) return [];
    const itemRows = await this.db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, rows.map((r) => r.id)));
    return rows.map((r) => ({
      ...mapOrder(r),
      items: itemRows.filter((i) => i.orderId === r.id).map(mapItem),
    }));
  }

  async findByIdWithItems(orderId: string): Promise<OrderWithItems | null> {
    const rows = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return (await this.withItems(rows))[0] ?? null;
  }

  async findByCheckoutSessionId(checkoutSessionId: string): Promise<OrderWithItems | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.stripeCheckoutSessionId, checkoutSessionId))
      .limit(1);
    return (await this.withItems(rows))[0] ?? null;
  }

  async markPaidIfPending(orderId: string, details: PaymentDetails): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(orders)
      .set({
        status: "paid",
        paidAt: now,
        updatedAt: now,
        stripePaymentIntentId: details.stripePaymentIntentId,
        totalAmount: details.totalAmount,
        shippingAmount: details.shippingAmount,
        shippingAddress: details.shippingAddress,
        customerName: details.customerName,
        customerEmail: details.customerEmail,
        customerPhone: details.customerPhone,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning({ id: orders.id });
    return updated.length === 1;
  }

  async closeIfPending(orderId: string, status: "canceled" | "expired"): Promise<boolean> {
    const now = new Date();
    const updated = await this.db
      .update(orders)
      .set({ status, canceledAt: now, updatedAt: now })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
      .returning({ id: orders.id });
    return updated.length === 1;
  }

  async decrementStock(items: Array<{ productId: string; quantity: number }>): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(products)
          .set({ stock: sql`GREATEST(${products.stock} - ${item.quantity}, 0)`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
      }
    });
  }

  async markEmailSent(orderId: string, kind: "customer" | "owner"): Promise<void> {
    const now = new Date();
    await this.db
      .update(orders)
      .set(kind === "customer" ? { customerEmailSentAt: now } : { ownerEmailSentAt: now })
      .where(eq(orders.id, orderId));
  }

  async findByPaymentIntentId(paymentIntentId: string): Promise<OrderWithItems | null> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    return (await this.withItems(rows))[0] ?? null;
  }

  async recordRefund(
    orderId: string,
    refundedAmount: string,
    fullyRefunded: boolean,
  ): Promise<{ becameRefunded: boolean; amountChanged: boolean }> {
    const now = new Date();
    if (fullyRefunded) {
      const changed = await this.db
        .update(orders)
        .set({ status: "refunded", refundedAmount, refundedAt: now, updatedAt: now })
        .where(and(eq(orders.id, orderId), eq(orders.status, "paid")))
        .returning({ id: orders.id });
      if (changed.length === 1) return { becameRefunded: true, amountChanged: true };
    }
    // Reembolso parcial (o evento repetido): solo actualiza el monto si aumentó.
    const changed = await this.db
      .update(orders)
      .set({ refundedAmount, refundedAt: now, updatedAt: now })
      .where(and(eq(orders.id, orderId), sql`${orders.refundedAmount} < ${refundedAmount}`))
      .returning({ id: orders.id });
    return { becameRefunded: false, amountChanged: changed.length === 1 };
  }

  async incrementStock(items: Array<{ productId: string; quantity: number }>): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(products)
          .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
      }
    });
  }

  async recordDispute(orderId: string, status: string, reason: string | null): Promise<boolean> {
    const now = new Date();
    const first = await this.db
      .update(orders)
      .set({ disputeStatus: status, disputeReason: reason, disputedAt: now, updatedAt: now })
      .where(and(eq(orders.id, orderId), isNull(orders.disputedAt)))
      .returning({ id: orders.id });
    if (first.length === 1) return true;
    await this.db
      .update(orders)
      .set({ disputeStatus: status, disputeReason: reason, updatedAt: now })
      .where(eq(orders.id, orderId));
    return false;
  }

  async listByUser(userId: string, limit: number): Promise<OrderWithItems[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
    return this.withItems(rows);
  }
}
