import { NextResponse } from "next/server";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}

export function apiSuccess<T>(data: T, message?: string, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    {
      success: true,
      data,
      message,
    },
    { status }
  );
}

export function apiError(
  error: string,
  status = 400,
  code = "BAD_REQUEST"
) {
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      error,
      code,
    },
    { status }
  );
}
