import type { InboundPayloadErrorSnapshot } from "../logging/inbound-payload-error-snapshot.js";

export interface InboundPayloadErrorLogRepository {
  save(
    entry: InboundPayloadErrorSnapshot & { id: string; createdAt: Date },
  ): Promise<void>;
}
