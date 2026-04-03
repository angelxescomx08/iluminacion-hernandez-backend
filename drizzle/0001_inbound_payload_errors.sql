CREATE TABLE "inbound_payload_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"http_method" text NOT NULL,
	"path" text NOT NULL,
	"payload" jsonb,
	"error_name" text NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
