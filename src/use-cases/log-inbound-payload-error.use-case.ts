import { randomUUID } from "node:crypto";
import type { InboundPayloadErrorSnapshot } from "../domain/logging/inbound-payload-error-snapshot.js";
import type { InboundPayloadErrorLogRepository } from "../domain/ports/inbound-payload-error-log.repository.port.js";

export class LogInboundPayloadErrorUseCase {
  constructor(private readonly repository: InboundPayloadErrorLogRepository) {}

  async execute(snapshot: InboundPayloadErrorSnapshot): Promise<void> {
    await this.repository.save({
      ...snapshot,
      id: randomUUID(),
      createdAt: new Date(),
    });
  }
}
