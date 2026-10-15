import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/security/auth";
import { apiSuccess } from "@/lib/utils/response";

export async function POST() {
  const response = apiSuccess({ loggedOut: true }, "تم تسجيل الخروج بنجاح");
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
