import compression from "compression";
import cors from "cors";
import express, { type Router } from "express";
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
  productRouter: Router;
};

export function createApp(options: CreateAppOptions): express.Application {
  const { auth, logInboundPayloadError, productRouter } = options;
  const app = express();

  // 1. TRUST PROXY: Vital para detectar HTTPS detrás de Nginx en AWS
  app.set("trust proxy", true);

  // 2. HELMET: Configurado para permitir la comunicación entre dominios
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins?.length ? allowedOrigins : true,
      credentials: true,
    }),
  );

  // 3. COMPRESIÓN
  app.use(compression());

  // 4. BETTER AUTH: El handler debe ir antes de express.json()
  app.all("/api/auth/*", toNodeHandler(auth));

  // 5. BODY PARSER
  app.use(express.json({ limit: "1mb" }));

  // 6. RUTAS DE LA API
  app.use("/api/v1/auth", createAuthRouter(auth));
  app.use("/api/v1/products", productRouter);

  // 7. CONTROLADOR HELLO (Greet)
  const greetUseCase = new GreetUseCase();
  const helloController = new HelloController(greetUseCase);
  app.get("/api/hello", helloController.getHello);

  // 8. MANEJADOR 404 (Para rutas de API inexistentes)
  app.use((_req, res) => {
    res.status(404).json({ error: "No encontrado" });
  });

  // 9. ERROR HANDLER GLOBAL: Siempre al final
  app.use(createGlobalErrorHandler(logInboundPayloadError));

  return app;
}