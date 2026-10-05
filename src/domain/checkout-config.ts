export type CheckoutConfig = {
  currency: string;
  /** Costo fijo de envío a domicilio en pesos (ej. 199). */
  shippingFlatRate: number;
  /** Sucursal donde se recogen los pedidos con `pickup`. */
  pickupBranch: { name: string; address: string };
  /** URL pública del sitio (frontend) para success/cancel de Stripe, sin `/` final. */
  siteUrl: string;
  /** Correo que recibe el aviso de "Nuevo pedido". */
  ownerEmail: string | null;
  /** Remitente verificado en Resend. */
  fromEmail: string | null;
  /** Minutos que dura abierta la sesión de pago (Stripe exige mínimo 30). */
  sessionMinutes: number;
  maxQuantityPerItem: number;
  maxDistinctItems: number;
};

export const DEFAULT_PICKUP_BRANCH = {
  name: "Sucursal Victoria 31",
  address: "Victoria 31, Pasillo de acceso centro, Cuauhtémoc, CDMX, 06050",
} as const;

export function toCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMxn(amount: string | number): string {
  return `$${Number(amount).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}
