import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/security/auth";
import { apiSuccess, apiError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return apiError("غير مسجل الدخول", 401, "UNAUTHORIZED");
  }
  return apiSuccess({ user });
}
