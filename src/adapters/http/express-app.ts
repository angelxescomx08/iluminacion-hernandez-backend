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

  // 2. CORS: Debe ir ANTES que cualquier otra cosa para manejar el pre-flight (OPTIONS)
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins?.length ? allowedOrigins : true,
      credentials: true, // Crucial para que Better Auth pueda leer/enviar cookies entre dominios
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    }),
  );

  // 3. HELMET: Seguridad básica. Ajustamos la política de recursos para permitir el CORS
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // 4. COMPRESIÓN: Para que las respuestas pesen menos
  app.use(compression());

  // 5. BETTER AUTH HANDLER: Se coloca aquí para que CORS y Helmet ya hayan procesado la petición
  app.all("/api/auth/*", toNodeHandler(auth));

  // 6. BODY PARSER: Solo después del handler de Better Auth para no interferir con sus streams
  app.use(express.json({ limit: "1mb" }));

  // 7. RUTAS DE LA API (v1)
  app.use("/api/v1/auth", createAuthRouter(auth));
  app.use("/api/v1/products", productRouter);

  // 8. CONTROLADORES EXTRA (Ejemplo Hello)
  const greetUseCase = new GreetUseCase();
  const helloController = new HelloController(greetUseCase);
  app.get("/api/hello", helloController.getHello);

  // 9. MANEJADOR 404: Si no entró en ninguna ruta anterior
  app.use((_req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
  });

  // 10. ERROR HANDLER GLOBAL: Siempre al final
  app.use(createGlobalErrorHandler(logInboundPayloadError));

  return app;
}