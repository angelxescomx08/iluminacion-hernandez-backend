import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../../../infrastructure/auth/create-auth.js";

export type SessionUser = { id: string; email: string; name: string | null };

/** Exige sesión iniciada (cualquier rol). Deja el usuario en `res.locals.user`. */
export function createRequireUserMiddleware(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session?.user?.id) {
        res.status(401).json({ error: "Inicia sesión para continuar", code: "unauthenticated" });
        return;
      }
      const user: SessionUser = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
      };
      res.locals.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
