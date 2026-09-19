import { Router } from "express";
import type { SendContactMessageUseCase } from "../../use-cases/send-contact-message.use-case.js";
import { ContactHttpController } from "./contact-http.controller.js";

export type ContactRouterDeps = {
  sendContactMessage: SendContactMessageUseCase;
};

export function createContactRouter(deps: ContactRouterDeps): Router {
  const router = Router();
  const controller = new ContactHttpController(deps.sendContactMessage);

  router.post("/", controller.send);

  return router;
}
