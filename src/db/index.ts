import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import * as dotenv from "dotenv";

dotenv.config();

const rawConn =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_PwWrK2l4iyZu@ep-rapid-heart-b5kd9qu2.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
const connectionString = rawConn
  .replace("&channel_binding=require", "")
  .replace("channel_binding=require&", "")
  .replace("?channel_binding=require", "?")
  .replace("channel_binding=require", "")
  .replace("sslmode=require", "sslmode=verify-full");

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

let pool: Pool;

if (process.env.NODE_ENV === "production") {
  pool = new Pool({
    connectionString,
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 35000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
} else {
  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 35000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false },
    });
  }
  pool = global._pgPool;
}

export const db = drizzle(pool, { schema });
export { pool };
export default db;
