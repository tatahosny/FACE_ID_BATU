import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking and upgrading users table for ban and lock capabilities...");

  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ban_reason TEXT;
  `);

  await db.execute(sql`
    ALTER TABLE students
    ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ban_reason TEXT,
    ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);

  console.log("Users and students tables upgraded successfully with banned_until, ban_reason, and password_hash!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
