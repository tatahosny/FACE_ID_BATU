import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS delay_count INTEGER NOT NULL DEFAULT 0;
  `);
  console.log("Migration successful: delay_count added to bookings.");
  process.exit(0);
}
main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

