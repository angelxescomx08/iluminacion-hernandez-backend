import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppDatabase } from "../../adapters/persistence/postgres/postgres-database.adapter.js";
import { authSchema } from "../../adapters/persistence/drizzle/schema/index.js";

function googleSocialProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return {};
  return {
    google: {
      clientId,
      clientSecret,
    },
  };
}

export function createAuth(database: AppDatabase) {
  const trustedOrigins = process.env.TRUSTED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: { enabled: true },
    socialProviders: googleSocialProvider(),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
        },
        stripeCustomerId: {
          type: "string",
          required: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      storeSessionInDatabase: true,
    },
    trustedOrigins: trustedOrigins?.length ? trustedOrigins : undefined,
  });
}

export type Auth = ReturnType<typeof createAuth>;
