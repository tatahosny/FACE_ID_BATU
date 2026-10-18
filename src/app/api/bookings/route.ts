import { NextRequest } from "next/server";
import { BookingService } from "@/server/services/booking.service";
import { requireAuth, requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { createBookingSchema } from "@/lib/validation/booking";
import { db } from "@/db";
import { bookings, students, sections, bookingWindows } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { formatQueueNumber } from "@/lib/utils/datetime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    // Allow up to 300 requests/minute per IP to comfortably handle shared college Wi-Fi / NAT
    const ipRateLimit = checkRateLimit(`booking_ip:${ip}`, 300, 60 * 1000);
    if (!ipRateLimit.success) {
      return apiError("يرجى الانتظار قليلاً قبل تقديم طلب حجز آخر", 429, "RATE_LIMIT");
    }

    const body = await req.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // Rate limit per individual student (5 attempts per minute) to prevent duplicate clicks/spam
    if (parsed.data.academicNumber) {
      const studentRateLimit = checkRateLimit(
        `booking_student:${parsed.data.academicNumber.trim()}`,
        5,
        60 * 1000
      );
      if (!studentRateLimit.success) {
        return apiError("تم استلام طلبك بالفعل، يرجى الانتظار بضع ثوانٍ.", 429, "RATE_LIMIT");
      }
    }

    let studentId: string | null = null;
    let windowId: string | null = parsed.data.bookingWindowId || null;

    if (parsed.data.academicNumber) {
      // Direct booking by Academic Number (No student login required)
      const [student] = await db
        .select({
          id: students.id,
          sectionId: students.sectionId,
          subSection: students.subSection,
          telegramUserId: students.telegramUserId,
          isActive: students.isActive,
        })
        .from(students)
        .where(eq(students.academicNumber, parsed.data.academicNumber.trim()));

      if (!student) {
        return apiError("الرقم الأكاديمي غير مسجل، يرجى تسجيل بياناتك أولاً عبر صفحة التسجيل.", 404);
      }

      if (!student.isActive) {
        return apiError("الحساب الأكاديمي معطل، يرجى مراجعة إدارة الكلية.", 403);
      }

      if (!student.telegramUserId) {
        return apiError(
          "يرجى ربط حساب التيليجرام أولاً قبل الحجز لتصلك إشعارات الدور وموعد البصمة.",
          400
        );
      }

      studentId = student.id;

      // If windowId was not provided, automatically find the open window for student's section and subsection
      if (!windowId) {
        const now = new Date();
        const candidateWindows = await db
          .select({
            id: bookingWindows.id,
            subSection: bookingWindows.subSection,
          })
          .from(bookingWindows)
          .where(
            and(
              eq(bookingWindows.sectionId, student.sectionId),
              eq(bookingWindows.status, "OPEN"),
              sql`${bookingWindows.startsAt} <= ${now.toISOString()}`,
              sql`${bookingWindows.endsAt} >= ${now.toISOString()}`
            )
          )
          .orderBy(desc(bookingWindows.createdAt));

        const activeWindow = candidateWindows.find(
          (w) => w.subSection === "ALL" || w.subSection === (student.subSection || "A")
        );

        if (!activeWindow) {
          return apiError(
            `لم يتم تفعيل وقت البصمة للسكشن أو القسم الفرعي (${student.subSection || "A"}) بتاعك بعد. يرجى الانتظار، ستصلك رسالة تنبيهية على التيليجرام فور فتح الحجز.`,
            400
          );
        }
        windowId = activeWindow.id;
      }
    } else {
      // Fallback for authenticated staff or session
      const session = await requireAuth();
      studentId =
        session.role === USER_ROLES.STUDENT
          ? session.studentId || session.userId
          : parsed.data.studentId || null;

      if (!studentId) {
        return apiError("معرف الطالب مطلوب", 400);
      }
      if (!windowId) {
        return apiError("معرف فترة الحجز مطلوب", 400);
      }
    }

    const result = await BookingService.createBooking(
      studentId,
      windowId,
      parsed.data.idempotencyKey
    );

    const message = result.isExisting
      ? `لديك حجز مسبق بالفعل! تذكرة حجز رقم: #${result.formattedQueueNumber} على شباك ${result.desk}`
      : `تم تأكيد حجزك بنجاح! تذكرة حجز رقم: #${result.formattedQueueNumber} على شباك ${result.desk}`;

    return apiSuccess(result, message, result.isExisting ? 200 : 201);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("يرجى إدخال الرقم الأكاديمي للحجز", 401, "UNAUTHORIZED");
    }
    return apiError(error.message || "فشل إتمام الحجز", 400);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const { searchParams } = new URL(req.url);
    const windowId = searchParams.get("windowId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (windowId) conditions.push(eq(bookings.bookingWindowId, windowId));
    if (status) conditions.push(eq(bookings.status, status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select({
        id: bookings.id,
        queueNumber: bookings.queueNumber,
        status: bookings.status,
        bookedAt: bookings.bookedAt,
        calledAt: bookings.calledAt,
        studentName: students.fullName,
        academicNumber: students.academicNumber,
        sectionName: sections.name,
      })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(whereClause)
      .orderBy(bookings.queueNumber)
      .limit(limit)
      .offset(offset);

    const formatted = items.map((i) => ({
      ...i,
      formattedQueueNumber: formatQueueNumber(i.queueNumber),
    }));

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(bookings)
      .where(whereClause);

    return apiSuccess({
      items: formatted,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بعرض الحجوزات", 403);
    }
    return apiError(error.message || "فشل جلب الحجوزات", 500);
  }
}
