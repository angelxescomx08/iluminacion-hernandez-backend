import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { DatabaseConnection } from "../../../domain/ports/database-connection.port.js";
import { appSchema } from "../drizzle/schema/index.js";

export type AppDatabase = NodePgDatabase<typeof appSchema>;

export class PostgresDatabaseAdapter implements DatabaseConnection {
  private readonly pool: Pool;
  readonly db: AppDatabase;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema: appSchema });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
