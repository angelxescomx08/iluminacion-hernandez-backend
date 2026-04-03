import "dotenv/config";
import "express-async-errors";
import { createApp } from "../adapters/http/express-app.js";
import { InboundPayloadErrorLogDrizzleRepository } from "../adapters/persistence/drizzle/repositories/inbound-payload-error-log.drizzle.repository.js";
import { PostgresDatabaseAdapter } from "../adapters/persistence/postgres/postgres-database.adapter.js";
import { LogInboundPayloadErrorUseCase } from "../use-cases/log-inbound-payload-error.use-case.js";
import { createAuth } from "./auth/create-auth.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL es obligatoria");
}

const database = new PostgresDatabaseAdapter(databaseUrl);
const auth = createAuth(database.db);
const inboundErrorLogRepository = new InboundPayloadErrorLogDrizzleRepository(database.db);
const logInboundPayloadError = new LogInboundPayloadErrorUseCase(inboundErrorLogRepository);

const port = Number(process.env.PORT) || 3000;
const app = createApp({ auth, logInboundPayloadError });

const server = app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

async function shutdown(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await database.close();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
