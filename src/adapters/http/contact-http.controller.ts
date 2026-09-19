import type { RequestHandler } from "express";
import { HttpError } from "../../domain/errors/http-error.js";
import type { SendContactMessageUseCase } from "../../use-cases/send-contact-message.use-case.js";

export class ContactHttpController {
  constructor(private readonly sendContactMessage: SendContactMessageUseCase) {}

  send: RequestHandler = async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const nombre = body.nombre;
      const telefono = body.telefono;
      const email = body.email;
      const mensaje = body.mensaje;

      if (typeof nombre !== "string" || !nombre.trim()) {
        throw new HttpError("nombre es obligatorio", 400, "invalid_body");
      }
      if (typeof telefono !== "string" || !telefono.trim()) {
        throw new HttpError("telefono es obligatorio", 400, "invalid_body");
      }
      if (typeof email !== "string" || !email.trim()) {
        throw new HttpError("email es obligatorio", 400, "invalid_body");
      }
      if (mensaje !== undefined && mensaje !== null && typeof mensaje !== "string") {
        throw new HttpError("mensaje debe ser texto", 400, "invalid_body");
      }

      const result = await this.sendContactMessage.execute({
        nombre,
        telefono,
        email,
        mensaje: typeof mensaje === "string" ? mensaje : null,
      });
      res.status(201).json({ id: result.id });
    } catch (e) {
      next(e);
    }
  };
}
