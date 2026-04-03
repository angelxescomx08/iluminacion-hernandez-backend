import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import type { Auth } from "../../infrastructure/auth/create-auth.js";
import type { LogInboundPayloadErrorUseCase } from "../../use-cases/log-inbound-payload-error.use-case.js";
import { createAuthRouter } from "./auth.routes.js";
import { createGlobalErrorHandler } from "./middleware/global-error.middleware.js";
import { HelloController } from "./hello.controller.js";
import { GreetUseCase } from "../../use-cases/greet.use-case.js";

export type CreateAppOptions = {
  auth: Auth;
  logInboundPayloadError: LogInboundPayloadErrorUseCase;
};

export function createApp(options: CreateAppOptions): express.Application {
  const { auth, logInboundPayloadError } = options;
  const app = express();

  app.use(helmet());
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins?.length ? allowedOrigins : true,
      credentials: true,
    }),
  );
  app.use(compression());

  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json({ limit: "1mb" }));

  app.use("/api/v1/auth", createAuthRouter(auth));

  const greetUseCase = new GreetUseCase();
  const helloController = new HelloController(greetUseCase);

  app.get("/api/hello", helloController.getHello);

  app.use((_req, res) => {
    res.status(404).json({ error: "No encontrado" });
  });

  app.use(createGlobalErrorHandler(logInboundPayloadError));

  return app;
}
