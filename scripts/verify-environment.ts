import * as dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

async function verifyEnvironment() {
  console.log("🔍 [BATU FACE ID] Verifying system environment and dependencies...\n");

  let hasErrors = false;

  // 1. Verify Database URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is missing in environment!");
    hasErrors = true;
  } else {
    console.log("⏳ Connecting to Neon PostgreSQL...");
    try {
      const pool = new Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false },
      });
      const res = await pool.query("SELECT NOW() as current_time, current_database() as db_name");
      await pool.end();
      console.log(`✅ Database connected successfully! DB: ${res.rows[0].db_name}, Time: ${res.rows[0].current_time}`);
    } catch (err: any) {
      console.error(`❌ Database connection failed: ${err.message}`);
      hasErrors = true;
    }
  }

  // 2. Verify Telegram Bot Token
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN is missing!");
    hasErrors = true;
  } else {
    console.log("⏳ Verifying Telegram Bot API connectivity...");
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await res.json();
      if (data.ok) {
        console.log(`✅ Telegram Bot authenticated! Username: @${data.result.username} (ID: ${data.result.id})`);
      } else {
        console.error(`❌ Telegram Bot API error: ${data.description}`);
        hasErrors = true;
      }
    } catch (err: any) {
      console.error(`❌ Telegram request failed: ${err.message}`);
      hasErrors = true;
    }
  }

  // 3. Verify Encryption Key
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) {
    console.warn("⚠️ ENCRYPTION_KEY is not set! Using default internal development key.");
  } else if (encKey.length < 32) {
    console.warn("⚠️ ENCRYPTION_KEY is shorter than 32 characters. Recommended: 64 hex characters (32 bytes).");
  } else {
    console.log("✅ ENCRYPTION_KEY configured properly.");
  }

  // 4. Verify Auth Secret
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.warn("⚠️ AUTH_SECRET is not set! Using default secret.");
  } else {
    console.log("✅ AUTH_SECRET configured.");
  }

  console.log("\n==========================================");
  if (hasErrors) {
    console.error("❌ Environment verification finished with errors. Please check the logs above.");
    process.exit(1);
  } else {
    console.log("🎉 All core services and credentials verified successfully!");
    process.exit(0);
  }
}

verifyEnvironment();
