import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../../../infrastructure/auth/create-auth.js";

export function createRequireAdminMiddleware(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user?.id) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    const role = (session.user as { role?: string }).role;
    if (role !== "admin") {
      res.status(403).json({ error: "Se requiere rol administrador" });
      return;
    }
    res.locals.adminUserId = session.user.id;
    next();
  };
}
