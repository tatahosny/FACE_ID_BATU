import { NextRequest, NextResponse } from "next/server";
import { TelegramService } from "@/server/services/telegram.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Telegram Webhook Secret Token header if configured
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret) {
      const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
      if (headerSecret !== configuredSecret) {
        console.warn("[Telegram Webhook] Unauthorized request rejected: Invalid secret token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = await req.json();
    const result = await TelegramService.handleWebhookUpdate(update);

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error("[Telegram Webhook] Error processing update:", err);
    // Return 200 to Telegram to prevent retry storms on unrecoverable malformed updates
    return NextResponse.json({ ok: false, error: err.message }, { status: 200 });
  }
}
