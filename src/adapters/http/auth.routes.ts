import { Router } from "express";
import type { Auth } from "../../infrastructure/auth/create-auth.js";
import { AuthHttpController } from "./auth-http.controller.js";

/**
 * Rutas REST explícitas sobre Better Auth (`auth.api`).
 * El cliente Better Auth puede seguir usando `/api/auth/*` vía `toNodeHandler`.
 */
export function createAuthRouter(auth: Auth): Router {
  const router = Router();
  const controller = new AuthHttpController(auth);

  router.post("/register/email", controller.registerWithEmail);
  router.post("/login/email", controller.loginWithEmail);
  router.post("/login/google", controller.loginWithGoogle);
  router.post("/logout", controller.logout);
  router.get("/session", controller.getSession);

  return router;
}
