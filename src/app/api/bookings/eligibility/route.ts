import { NextRequest } from "next/server";
import { BookingService } from "@/server/services/booking.service";
import { requireAuth } from "@/lib/security/auth";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();

    // Student ID either from session directly or from studentId
    const studentId = session.studentId || session.userId;
    if (!studentId) {
      return apiError("لم يتم العثور على سجل الطالب", 400);
    }

    const eligibility = await BookingService.checkStudentEligibility(studentId);
    return apiSuccess(eligibility);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("يرجى تسجيل الدخول أولاً", 401, "UNAUTHORIZED");
    }
    return apiError(error.message || "فشل التحقق من صلاحية الحجز", 400);
  }
}
