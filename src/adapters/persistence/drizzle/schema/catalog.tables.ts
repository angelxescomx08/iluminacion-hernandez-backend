import { relations } from "drizzle-orm";
import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./auth.tables.js";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  content: text("content"),
  characteristics: jsonb("characteristics").$type<Record<string, unknown>>(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  stripeProductId: text("stripe_product_id").unique(),
  stripePriceId: text("stripe_price_id"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow(),
});

export const productImages = pgTable("product_images", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  /** Clave en el bucket (adaptador de almacenamiento); la URL pública completa va en `url`. */
  objectKey: text("object_key"),
  isMain: boolean("is_main").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const productsRelations = relations(products, ({ one, many }) => ({
  author: one(users, { fields: [products.createdBy], references: [users.id] }),
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));
