import type { OrderWithItems } from "../domain/entities/order.entity.js";
import { HttpError } from "../domain/errors/http-error.js";
import type { OrderRepositoryPort } from "../domain/ports/order.repository.port.js";
import type { PaymentCheckoutPort } from "../domain/ports/payment-checkout.port.js";
import type { FulfillCheckoutUseCase } from "./fulfill-checkout.use-case.js";

/**
 * El cliente regresó desde Stripe con "Atrás" sin pagar (cancel_url).
 * Se expira la sesión en Stripe para que ese enlace de pago ya no sirva y el pedido queda `canceled`.
 * Si por alguna razón la sesión ya estaba pagada, se confirma el pedido en lugar de cancelarlo.
 */
export class CancelCheckoutUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentCheckoutPort,
    private readonly fulfill: FulfillCheckoutUseCase,
  ) {}

  async execute(userId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.orders.findByIdWithItems(orderId);
    if (!order || order.userId !== userId) {
      throw new HttpError("Pedido no encontrado", 404, "order_not_found");
    }
    if (order.status !== "pending" || !order.stripeCheckoutSessionId) {
      return order;
    }

    const session = await this.payments.retrieveCheckoutSession(order.stripeCheckoutSessionId);
    if (session.paymentStatus === "paid") {
      return this.fulfill.execute(order.stripeCheckoutSessionId);
    }

    await this.payments.expireCheckoutSession(order.stripeCheckoutSessionId);
    await this.orders.closeIfPending(order.id, "canceled");
    const fresh = await this.orders.findByIdWithItems(order.id);
    return fresh ?? order;
  }
}
