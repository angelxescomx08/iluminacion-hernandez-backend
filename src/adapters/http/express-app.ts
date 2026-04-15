import compression from "compression";
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

  // 1. Trust Proxy habilitado para HTTPS
  app.set("trust proxy", true);

  // 2. Helmet ajustado para no bloquear el subdominio
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // NOTA: Hemos quitado app.use(cors(...)) porque Nginx se encargará de esto.
  
  app.use(compression());

  // 3. Handler de Better Auth
  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json({ limit: "1mb" }));

  // 4. Rutas
  app.use("/api/v1/auth", createAuthRouter(auth));
  app.use("/api/v1/products", productRouter);

  const greetUseCase = new GreetUseCase();
  const helloController = new HelloController(greetUseCase);
  app.get("/api/hello", helloController.getHello);

  app.use((_req, res) => {
    res.status(404).json({ error: "No encontrado" });
  });

  app.use(createGlobalErrorHandler(logInboundPayloadError));

  return app;
}