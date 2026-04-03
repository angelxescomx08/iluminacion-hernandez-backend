import { inboundPayloadErrors } from "../schema/logging.tables.js";
import type { AppDatabase } from "../../postgres/postgres-database.adapter.js";
import type { InboundPayloadErrorLogRepository } from "../../../../domain/ports/inbound-payload-error-log.repository.port.js";
import type { InboundPayloadErrorSnapshot } from "../../../../domain/logging/inbound-payload-error-snapshot.js";

export class InboundPayloadErrorLogDrizzleRepository implements InboundPayloadErrorLogRepository {
  constructor(private readonly db: AppDatabase) {}

  async save(
    entry: InboundPayloadErrorSnapshot & { id: string; createdAt: Date },
  ): Promise<void> {
    await this.db.insert(inboundPayloadErrors).values({
      id: entry.id,
      httpMethod: entry.httpMethod,
      path: entry.path,
      payload: entry.payload,
      errorName: entry.errorName,
      errorMessage: entry.errorMessage,
      errorStack: entry.errorStack,
      createdAt: entry.createdAt,
    });
  }
}
