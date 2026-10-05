import { type CheckoutConfig, formatMxn } from "../domain/checkout-config.js";
import { type OrderWithItems, orderShortCode } from "../domain/entities/order.entity.js";
import { WEBSITE_SUBJECT_TAG } from "./send-contact-message.use-case.js";

function itemLines(order: OrderWithItems): string[] {
  return order.items.map((i) => {
    const unit = Number(i.priceAtPurchase ?? 0);
    return `• ${i.quantity} × ${i.productTitle ?? i.productId} — ${formatMxn(unit * i.quantity)}`;
  });
}

function deliveryLines(order: OrderWithItems, config: CheckoutConfig): string[] {
  if (order.fulfillmentMethod === "pickup") {
    return [
      "Entrega: Recoger en sucursal",
      `${config.pickupBranch.name} — ${config.pickupBranch.address}`,
    ];
  }
  return ["Entrega: Envío a domicilio", `Dirección: ${order.shippingAddress ?? "(no disponible)"}`];
}

function totalsLines(order: OrderWithItems): string[] {
  return [
    `Subtotal: ${formatMxn(order.subtotalAmount)}`,
    `Envío: ${Number(order.shippingAmount) > 0 ? formatMxn(order.shippingAmount) : "Gratis"}`,
    `Total pagado: ${formatMxn(order.totalAmount)}`,
  ];
}

export function buildOwnerOrderEmail(order: OrderWithItems, config: CheckoutConfig) {
  const code = orderShortCode(order.id);
  return {
    subject: `${WEBSITE_SUBJECT_TAG} Nuevo pedido #${code} — ${formatMxn(order.totalAmount)}`,
    text: [
      `Nuevo pedido pagado #${code}`,
      "",
      `Cliente: ${order.customerName ?? "(sin nombre)"}`,
      `Correo: ${order.customerEmail ?? "(sin correo)"}`,
      `Teléfono: ${order.customerPhone ?? "(sin teléfono)"}`,
      "",
      ...deliveryLines(order, config),
      "",
      "Productos:",
      ...itemLines(order),
      "",
      ...totalsLines(order),
      "",
      `Pago en Stripe: ${order.stripePaymentIntentId ?? "(sin referencia)"}`,
      "",
      "—",
      "Enviado automáticamente por la tienda de iluminacion-hernandez.com",
    ].join("\n"),
  };
}

export function buildCustomerOrderEmail(order: OrderWithItems, config: CheckoutConfig) {
  const code = orderShortCode(order.id);
  const greeting = order.customerName ? `Hola ${order.customerName.split(" ")[0]},` : "Hola,";
  const next =
    order.fulfillmentMethod === "pickup"
      ? "Te avisaremos cuando tu pedido esté listo para recoger en sucursal."
      : "Te avisaremos cuando tu pedido salga a entrega (de 3 a 7 días hábiles).";
  return {
    subject: `Confirmación de tu pedido #${code} — Iluminación Hernández`,
    text: [
      greeting,
      "",
      `¡Gracias por tu compra! Recibimos tu pago y tu pedido #${code} está confirmado.`,
      "",
      "Productos:",
      ...itemLines(order),
      "",
      ...totalsLines(order),
      "",
      ...deliveryLines(order, config),
      "",
      next,
      "Si tienes cualquier duda, responde a este correo.",
      "",
      "Iluminación Hernández",
      config.siteUrl.replace(/^https?:\/\//, ""),
    ].join("\n"),
  };
}

export function buildOwnerRefundEmail(order: OrderWithItems, full: boolean) {
  const code = orderShortCode(order.id);
  return {
    subject: `${WEBSITE_SUBJECT_TAG} Reembolso ${full ? "total" : "parcial"} del pedido #${code} — ${formatMxn(order.refundedAmount)}`,
    text: [
      `Se registró un reembolso ${full ? "TOTAL" : "PARCIAL"} en Stripe para el pedido #${code}.`,
      "",
      `Cliente: ${order.customerName ?? "(sin nombre)"} <${order.customerEmail ?? "sin correo"}>`,
      `Total del pedido: ${formatMxn(order.totalAmount)}`,
      `Reembolsado: ${formatMxn(order.refundedAmount)}`,
      full ? "El stock de los productos se regresó al inventario." : "El stock no se modificó (reembolso parcial).",
      "",
      `Pago en Stripe: ${order.stripePaymentIntentId ?? "(sin referencia)"}`,
    ].join("\n"),
  };
}

export function buildCustomerRefundEmail(order: OrderWithItems, full: boolean) {
  const code = orderShortCode(order.id);
  return {
    subject: `Reembolso de tu pedido #${code} — Iluminación Hernández`,
    text: [
      order.customerName ? `Hola ${order.customerName.split(" ")[0]},` : "Hola,",
      "",
      full
        ? `Reembolsamos el total de tu pedido #${code}: ${formatMxn(order.refundedAmount)}.`
        : `Hicimos un reembolso parcial de ${formatMxn(order.refundedAmount)} a tu pedido #${code}.`,
      "El dinero se verá reflejado en tu tarjeta en 5 a 10 días hábiles, según tu banco.",
      "",
      "Si tienes dudas, responde a este correo.",
      "",
      "Iluminación Hernández",
    ].join("\n"),
  };
}

export function buildOwnerDisputeEmail(order: OrderWithItems) {
  const code = orderShortCode(order.id);
  return {
    subject: `${WEBSITE_SUBJECT_TAG} URGENTE: contracargo en el pedido #${code}`,
    text: [
      `El banco del cliente abrió una disputa (contracargo) por el pedido #${code}.`,
      "",
      `Motivo: ${order.disputeReason ?? "(no indicado)"}`,
      `Estado en Stripe: ${order.disputeStatus ?? "(desconocido)"}`,
      `Monto del pedido: ${formatMxn(order.totalAmount)}`,
      `Cliente: ${order.customerName ?? "(sin nombre)"} <${order.customerEmail ?? "sin correo"}>`,
      "",
      "Responde la disputa en el Dashboard de Stripe (Pagos → Disputas) antes de la fecha límite,",
      "con evidencia de la entrega o del servicio. Si no respondes, se pierde automáticamente.",
      "",
      `Pago en Stripe: ${order.stripePaymentIntentId ?? "(sin referencia)"}`,
    ].join("\n"),
  };
}
