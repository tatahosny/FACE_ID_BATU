import { NextRequest, NextResponse } from "next/server";

/**
 * Edge Middleware — lightweight route protection and security enforcement.
 * Runs before every request matching the config.matcher.
 *
 * Responsibilities:
 * 1. Block obviously malformed / scanning requests on admin API routes
 * 2. Add security headers on all responses (belt-and-suspenders alongside next.config.js)
 * 3. Enforce Telegram webhook secret validation without hitting Node.js runtime
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const response = NextResponse.next();

  // ── Security Headers (applied on every response) ──────────────────────────
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  // ── Telegram Webhook: validate secret token at edge before hitting handler ─
  if (pathname === "/api/telegram/webhook") {
    if (req.method !== "POST") {
      return new NextResponse("Method Not Allowed", { status: 405 });
    }
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret) {
      const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
      if (headerSecret !== configuredSecret) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return response;
  }

  // ── Block common scanner paths on admin API routes ─────────────────────────
  if (pathname.startsWith("/api/admin/")) {
    // Reject requests with obviously malformed content-types on mutation methods
    const method = req.method;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("application/json") && !contentType.includes("multipart/form-data")) {
        // Allow missing content-type for OPTIONS preflight
        if (method !== "OPTIONS") {
          return new NextResponse(JSON.stringify({ error: "Invalid Content-Type" }), {
            status: 415,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }
  }

  // ── Block access to hidden files (e.g. .env, .git) ────────────────────────
  if (
    pathname.includes("/.") ||
    pathname.endsWith(".env") ||
    pathname.endsWith(".sql") ||
    pathname.endsWith(".config")
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return response;
}

export const config = {
  matcher: [
    // Match all API routes and admin pages
    "/api/:path*",
    "/admin/:path*",
  ],
};
