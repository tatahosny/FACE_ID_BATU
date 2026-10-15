import { NextRequest } from "next/server";
import { BookingService } from "@/server/services/booking.service";
import { getSessionUser } from "@/lib/security/auth";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { db } from "@/db";
import { students } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const academicNumberParam = req.nextUrl.searchParams.get("academicNumber")?.trim();

    let studentId: string | null = null;

    if (academicNumberParam) {
      const [foundStudent] = await db
        .select()
        .from(students)
        .where(eq(students.academicNumber, academicNumberParam))
        .limit(1);

      if (!foundStudent) {
        return apiError("لم يتم العثور على طالب مسجل بهذا الرقم الأكاديمي", 404);
      }
      studentId = foundStudent.id;
    } else {
      const session = await getSessionUser();
      if (!session) {
        return apiError("يرجى إدخال الرقم الأكاديمي لعرض حالة دورك", 400);
      }
      studentId = session.studentId || session.userId || null;
    }

    if (!studentId) {
      return apiError("لم يتم تحديد حساب الطالب", 400);
    }

    const queueStatus = await BookingService.getStudentQueueStatus(studentId);

    if (!queueStatus) {
      return apiSuccess({ hasBooking: false, status: null });
    }

    return apiSuccess({ hasBooking: true, ...queueStatus });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب حالة الدور", 500);
  }
}
