import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import type { Auth } from "../../infrastructure/auth/create-auth.js";
import { HelloController } from "./hello.controller.js";
import { GreetUseCase } from "../../use-cases/greet.use-case.js";

export type CreateAppOptions = {
  auth: Auth;
};

export function createApp(options: CreateAppOptions): express.Application {
  const { auth } = options;
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

  const greetUseCase = new GreetUseCase();
  const helloController = new HelloController(greetUseCase);

  app.get("/api/hello", helloController.getHello);

  return app;
}
