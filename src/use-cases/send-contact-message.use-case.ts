import { HttpError } from "../domain/errors/http-error.js";
import type { EmailSenderPort } from "../domain/ports/email-sender.port.js";
import { isValidEmail } from "../domain/utils/email.js";

export type SendContactMessageInput = {
  nombre: string;
  telefono: string;
  email: string;
  mensaje?: string | null;
};

function buildEmailBody(input: SendContactMessageInput): string {
  return [
    `Nombre: ${input.nombre}`,
    `Teléfono: ${input.telefono}`,
    `Correo: ${input.email}`,
    "",
    "Mensaje:",
    input.mensaje?.trim() || "(sin mensaje)",
  ].join("\n");
}

export class SendContactMessageUseCase {
  constructor(
    private readonly emailSender: EmailSenderPort,
    private readonly toAddress: string,
    private readonly fromAddress: string,
  ) {}

  async execute(input: SendContactMessageInput): Promise<{ id: string | null }> {
    const nombre = input.nombre.trim();
    const telefono = input.telefono.trim();
    const email = input.email.trim();

    if (!nombre) {
      throw new HttpError("nombre es obligatorio", 400, "invalid_body");
    }
    if (!telefono) {
      throw new HttpError("telefono es obligatorio", 400, "invalid_body");
    }
    if (!email || !isValidEmail(email)) {
      throw new HttpError("email inválido", 400, "invalid_body");
    }

    return this.emailSender.sendEmail({
      to: [this.toAddress],
      from: this.fromAddress,
      replyTo: email,
      subject: `Nuevo mensaje de contacto — ${nombre}`,
      text: buildEmailBody({ nombre, telefono, email, mensaje: input.mensaje }),
    });
  }
}
