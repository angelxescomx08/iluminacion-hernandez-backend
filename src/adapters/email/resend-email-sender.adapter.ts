import { Resend } from "resend";
import { HttpError } from "../../domain/errors/http-error.js";
import type { EmailSenderPort, SendEmailInput } from "../../domain/ports/email-sender.port.js";

export class ResendEmailSenderAdapter implements EmailSenderPort {
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
    const { data, error } = await this.resend.emails.send({
      to: input.to,
      from: input.from,
      subject: input.subject,
      text: input.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    if (error) {
      throw new HttpError(`No se pudo enviar el correo: ${error.message}`, 502, "email_send_failed");
    }

    return { id: data?.id ?? null };
  }
}
