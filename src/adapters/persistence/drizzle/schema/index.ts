export * from "./auth.tables.js";
export * from "./catalog.tables.js";
export * from "./logging.tables.js";
export * from "./orders.tables.js";

import {
  accounts,
  accountsRelations,
  sessions,
  sessionsRelations,
  users,
  usersRelations,
  verifications,
} from "./auth.tables.js";
import { orderItems, orderItemsRelations, orders, ordersRelations } from "./orders.tables.js";
import {
  productImages,
  productImagesRelations,
  products,
  productsRelations,
} from "./catalog.tables.js";
import { inboundPayloadErrors } from "./logging.tables.js";

/** Tablas expuestas al adaptador de Better Auth (claves = nombres de modelo internos). */
export const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
} as const;

/** Esquema completo para Drizzle y migraciones. */
export const appSchema = {
  users,
  usersRelations,
  sessions,
  sessionsRelations,
  accounts,
  accountsRelations,
  verifications,
  products,
  productsRelations,
  productImages,
  productImagesRelations,
  orders,
  ordersRelations,
  orderItems,
  orderItemsRelations,
  inboundPayloadErrors,
};
