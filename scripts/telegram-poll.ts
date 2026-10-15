import { TelegramService } from "../src/server/services/telegram.service";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "8647667481:AAFATdXAHLuktMs2bzZpDRBghOUYEZfQOA4";
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function startPolling() {
  console.log("🤖 Starting BATU Telegram Long Polling Service for local dev...");
  console.log("📡 Connected to Bot: @batu_face_id_bot");

  // First, remove any dangling webhook so getUpdates works reliably
  try {
    await fetch(`${TELEGRAM_API_BASE}/deleteWebhook?drop_pending_updates=false`);
  } catch (err: any) {
    console.warn("Could not delete webhook:", err.message);
  }

  let offset = 0;

  while (true) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const url = `${TELEGRAM_API_BASE}/getUpdates?offset=${offset}&timeout=10`;

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const data = await response.json();
      if (!data.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const updates = data.result || [];
      for (const update of updates) {
        offset = update.update_id + 1;
        console.log(
          `📩 Processing Update #${update.update_id} from ${
            update.message?.from?.first_name || "Unknown"
          }...`
        );
        try {
          const res = await TelegramService.handleWebhookUpdate(update);
          console.log(`✅ Update #${update.update_id} result:`, res);
        } catch (err: any) {
          console.error(`❌ Error processing update #${update.update_id}:`, err.message);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.warn("Polling notice:", err.message);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

startPolling();
