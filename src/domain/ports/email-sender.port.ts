export type SendEmailInput = {
  to: string[];
  from: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export interface EmailSenderPort {
  sendEmail(input: SendEmailInput): Promise<{ id: string | null }>;
}
