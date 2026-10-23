import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Adding reason_requested_at column to feedback_ratings if not exists...");
  await p.query(`
    ALTER TABLE feedback_ratings 
    ADD COLUMN IF NOT EXISTS reason_requested_at TIMESTAMPTZ;
  `);

  console.log("Column reason_requested_at ensured successfully!");
  await p.end();
}

main().catch(console.error);
