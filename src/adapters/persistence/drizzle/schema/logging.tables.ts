import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const inboundPayloadErrors = pgTable("inbound_payload_errors", {
  id: text("id").primaryKey(),
  httpMethod: text("http_method").notNull(),
  path: text("path").notNull(),
  payload: jsonb("payload").$type<unknown>(),
  errorName: text("error_name").notNull(),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
