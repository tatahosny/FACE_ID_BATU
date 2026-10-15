import { NextRequest } from "next/server";
import { BookingService } from "@/server/services/booking.service";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  academicNumber: z.string().min(1, "الرقم الأكاديمي مطلوب"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const result = await BookingService.resendBookingTelegram(parsed.data.academicNumber);
    return apiSuccess(result, result.message);
  } catch (err: any) {
    return apiError(err.message || "فشل إرسال تفاصيل الدور إلى التيليجرام", 400);
  }
}
