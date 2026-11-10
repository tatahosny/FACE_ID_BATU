/**
 * Migration: Create telegram_bot_messages table
 * Stores every message_id sent by the bot so we can purge them later.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Creating telegram_bot_messages table...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS telegram_bot_messages (
      id          BIGSERIAL PRIMARY KEY,
      chat_id     BIGINT NOT NULL,
      message_id  INTEGER NOT NULL,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (chat_id, message_id)
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_tbm_chat_id ON telegram_bot_messages(chat_id)
  `);

  console.log("Migration successful: telegram_bot_messages created.");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});

