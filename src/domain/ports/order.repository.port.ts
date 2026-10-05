import type { Order, OrderItem, OrderStatus, OrderWithItems } from "../entities/order.entity.js";

export type PaymentDetails = {
  stripePaymentIntentId: string | null;
  totalAmount: string;
  shippingAmount: string;
  shippingAddress: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
};

export interface OrderRepositoryPort {
  insertWithItems(order: Order, items: OrderItem[]): Promise<void>;
  attachCheckoutSession(orderId: string, checkoutSessionId: string): Promise<void>;
  findByIdWithItems(orderId: string): Promise<OrderWithItems | null>;
  findByCheckoutSessionId(checkoutSessionId: string): Promise<OrderWithItems | null>;
  /**
   * Marca el pedido como pagado SOLO si sigue `pending` (operación atómica).
   * Si dos llamadas compiten (webhook + página de éxito), solo una recibe `true`
   * y es la única que descuenta stock y envía correos.
   */
  markPaidIfPending(orderId: string, details: PaymentDetails): Promise<boolean>;
  /** Cambia `pending` → `canceled` | `expired`. Devuelve `true` si hubo cambio. */
  closeIfPending(orderId: string, status: Extract<OrderStatus, "canceled" | "expired">): Promise<boolean>;
  /** Descuenta stock sin bajar de 0. */
  decrementStock(items: Array<{ productId: string; quantity: number }>): Promise<void>;
  markEmailSent(orderId: string, kind: "customer" | "owner"): Promise<void>;
  findByPaymentIntentId(paymentIntentId: string): Promise<OrderWithItems | null>;
  /**
   * Registra el total reembolsado. Si `fullyRefunded`, pasa `paid` → `refunded` de forma atómica
   * y devuelve `becameRefunded: true` solo a la llamada que hizo la transición (para regresar stock una vez).
   */
  recordRefund(
    orderId: string,
    refundedAmount: string,
    fullyRefunded: boolean,
  ): Promise<{ becameRefunded: boolean; amountChanged: boolean }>;
  incrementStock(items: Array<{ productId: string; quantity: number }>): Promise<void>;
  /** Guarda el estado de la disputa. Devuelve `true` si es la primera vez que se registra. */
  recordDispute(orderId: string, status: string, reason: string | null): Promise<boolean>;
  listByUser(userId: string, limit: number): Promise<OrderWithItems[]>;
}
