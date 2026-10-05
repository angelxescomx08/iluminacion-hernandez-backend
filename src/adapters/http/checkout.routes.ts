import express, { Router, type RequestHandler } from "express";
import type { CheckoutConfig } from "../../domain/checkout-config.js";
import { type OrderWithItems, orderShortCode } from "../../domain/entities/order.entity.js";
import { HttpError } from "../../domain/errors/http-error.js";
import type { OrderRepositoryPort } from "../../domain/ports/order.repository.port.js";
import type { Auth } from "../../infrastructure/auth/create-auth.js";
import type { CancelCheckoutUseCase } from "../../use-cases/cancel-checkout.use-case.js";
import type { CreateCheckoutSessionUseCase } from "../../use-cases/create-checkout-session.use-case.js";
import type { FulfillCheckoutUseCase } from "../../use-cases/fulfill-checkout.use-case.js";
import type { HandleStripeWebhookUseCase } from "../../use-cases/handle-stripe-webhook.use-case.js";
import { createRequireUserMiddleware, type SessionUser } from "./middleware/require-user.middleware.js";

export function toOrderJson(o: OrderWithItems) {
  return {
    id: o.id,
    code: orderShortCode(o.id),
    status: o.status,
    fulfillmentMethod: o.fulfillmentMethod,
    pickupBranch: o.pickupBranch,
    shippingAddress: o.shippingAddress,
    subtotal: o.subtotalAmount,
    shipping: o.shippingAmount,
    total: o.totalAmount,
    currency: o.currency,
    paidAt: o.paidAt?.toISOString() ?? null,
    refunded: o.refundedAmount,
    refundedAt: o.refundedAt?.toISOString() ?? null,
    createdAt: o.createdAt?.toISOString() ?? null,
    items: o.items.map((i) => ({
      productId: i.productId,
      title: i.productTitle,
      quantity: i.quantity,
      unitPrice: i.priceAtPurchase,
    })),
  };
}

export type CheckoutRouterDeps = {
  auth: Auth;
  config: CheckoutConfig;
  orders: OrderRepositoryPort;
  createCheckout: CreateCheckoutSessionUseCase;
  fulfillCheckout: FulfillCheckoutUseCase;
  cancelCheckout: CancelCheckoutUseCase;
};

/** Rutas bajo `/api/v1` para el proceso de compra (requieren sesión, salvo `/checkout/options`). */
export function createCheckoutRouter(deps: CheckoutRouterDeps): Router {
  const router = Router();
  const requireUser = createRequireUserMiddleware(deps.auth);
  const user = (res: express.Response) => res.locals.user as SessionUser;

  router.get("/checkout/options", (_req, res) => {
    res.json({
      currency: deps.config.currency,
      shipping: { amount: deps.config.shippingFlatRate.toFixed(2), label: "Envío a domicilio", estimate: "3 a 7 días hábiles" },
      pickup: { amount: "0.00", label: "Recoger en sucursal", branch: deps.config.pickupBranch },
      maxQuantityPerItem: deps.config.maxQuantityPerItem,
    });
  });

  const createSession: RequestHandler = async (req, res, next) => {
    try {
      const u = user(res);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await deps.createCheckout.execute({
        userId: u.id,
        userEmail: u.email,
        userName: u.name,
        items: body.items,
        fulfillment: body.fulfillment,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  };

  const getSession: RequestHandler = async (req, res, next) => {
    try {
      const sessionId = String(req.params.sessionId ?? "");
      if (!sessionId.startsWith("cs_")) throw new HttpError("Sesión de pago inválida", 400, "invalid_session");
      // Fulfillment también desde la página de éxito (por si el webhook tarda): docs de Stripe.
      const order = await deps.fulfillCheckout.execute(sessionId);
      if (order.userId !== user(res).id) throw new HttpError("Pedido no encontrado", 404, "order_not_found");
      res.json(toOrderJson(order));
    } catch (e) {
      next(e);
    }
  };

  const cancel: RequestHandler = async (req, res, next) => {
    try {
      const order = await deps.cancelCheckout.execute(user(res).id, String(req.params.orderId ?? ""));
      res.json(toOrderJson(order));
    } catch (e) {
      next(e);
    }
  };

  const myOrders: RequestHandler = async (_req, res, next) => {
    try {
      const list = await deps.orders.listByUser(user(res).id, 50);
      res.json({ data: list.map(toOrderJson) });
    } catch (e) {
      next(e);
    }
  };

  router.post("/checkout/sessions", requireUser, createSession);
  router.get("/checkout/sessions/:sessionId", requireUser, getSession);
  router.post("/checkout/orders/:orderId/cancel", requireUser, cancel);
  router.get("/orders", requireUser, myOrders);

  return router;
}

/**
 * Webhook de Stripe. Necesita el cuerpo CRUDO para verificar la firma,
 * por eso se monta antes de `express.json()`.
 */
export function createStripeWebhookRouter(handleWebhook: HandleStripeWebhookUseCase): Router {
  const router = Router();
  router.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res, next) => {
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
      const result = await handleWebhook.execute(body, req.header("stripe-signature") ?? undefined);
      res.json({ received: true, ...result });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
