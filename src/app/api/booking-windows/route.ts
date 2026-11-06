import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookingWindows, groups, sections, bookings } from "@/db/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { createBookingWindowSchema } from "@/lib/validation/booking";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get("sectionId");

    // Auto-ensure: guarantee that every active section across all academic years has a canonical booking window
    try {
      const allSecs = await db
        .select({
          id: sections.id,
          groupId: sections.groupId,
          academicYear: groups.academicYear,
          specialization: groups.specialization,
        })
        .from(sections)
        .innerJoin(groups, eq(sections.groupId, groups.id));
      const existingWins = await db.select({ sectionId: bookingWindows.sectionId }).from(bookingWindows);
      const existingSet = new Set(existingWins.map((w) => w.sectionId));
      const missingSecs = allSecs.filter((s) => !existingSet.has(s.id));
      if (missingSecs.length > 0) {
        await db.insert(bookingWindows).values(
          missingSecs.map((s) => ({
            groupId: s.groupId,
            sectionId: s.id,
            academicYear: s.academicYear,
            specialization: s.specialization,
            subSection: "ALL" as const,
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            capacity: 50,
            status: "CLOSED",
            nextQueueNumber: 1,
          }))
        );
      }
    } catch (ensureErr) {
      console.warn("Auto-ensure booking windows warning:", ensureErr);
    }

    const query = db
      .select({
        id: bookingWindows.id,
        groupId: bookingWindows.groupId,
        groupName: groups.name,
        academicYear: groups.academicYear,
        specialization: groups.specialization,
        sectionId: bookingWindows.sectionId,
        sectionName: sections.name,
        startsAt: bookingWindows.startsAt,
        endsAt: bookingWindows.endsAt,
        status: bookingWindows.status,
        capacity: bookingWindows.capacity,
        subSection: bookingWindows.subSection,
        nextQueueNumber: bookingWindows.nextQueueNumber,
        createdAt: bookingWindows.createdAt,
      })
      .from(bookingWindows)
      .innerJoin(groups, eq(bookingWindows.groupId, groups.id))
      .innerJoin(sections, eq(bookingWindows.sectionId, sections.id))
      .orderBy(asc(groups.code), asc(sections.code));

    if (sectionId) {
      query.where(eq(bookingWindows.sectionId, sectionId));
    }

    const items = await query;

    // Calculate actual booked counts per window
    const counts = await db
      .select({
        windowId: bookings.bookingWindowId,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(bookings)
      .groupBy(bookings.bookingWindowId);

    const countsMap = new Map(counts.map((c) => [c.windowId, c.count]));

    const formatted = items.map((w) => {
      const bookedCount = countsMap.get(w.id) || 0;
      return {
        ...w,
        bookedCount,
        remainingCapacity: Math.max(0, w.capacity - bookedCount),
      };
    });

    return apiSuccess({ windows: formatted });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب فترات الحجز", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const parsed = createBookingWindowSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const subSec = parsed.data.subSection || "ALL";

    const [groupRecord] = await db
      .select({ academicYear: groups.academicYear, specialization: groups.specialization })
      .from(groups)
      .where(eq(groups.id, parsed.data.groupId))
      .limit(1);

    const academicYear = groupRecord?.academicYear || "الفرقة الثانية";
    const specialization = groupRecord?.specialization || null;

    // Enforce exactly one canonical booking window per section
    const [existingWindow] = await db
      .select({ id: bookingWindows.id })
      .from(bookingWindows)
      .where(eq(bookingWindows.sectionId, parsed.data.sectionId))
      .limit(1);

    if (existingWindow) {
      const [updated] = await db
        .update(bookingWindows)
        .set({
          groupId: parsed.data.groupId,
          academicYear,
          specialization,
          subSection: subSec,
          startsAt: new Date(parsed.data.startsAt),
          endsAt: new Date(parsed.data.endsAt),
          capacity: parsed.data.capacity,
          status: parsed.data.status,
          updatedAt: new Date(),
        })
        .where(eq(bookingWindows.id, existingWindow.id))
        .returning();

      return apiSuccess({ window: updated }, "تم تحديث فترة الحجز الحالية للسكشن بنجاح", 200);
    }

    const [maxBooking] = await db
      .select({ maxQueue: sql<number>`COALESCE(MAX(${bookings.queueNumber}), 0)` })
      .from(bookings);

    const [maxWindow] = await db
      .select({ maxNext: sql<number>`COALESCE(MAX(${bookingWindows.nextQueueNumber}), 1)` })
      .from(bookingWindows);

    const currentGlobalNext = Math.max(
      Number(maxBooking?.maxQueue || 0) + 1,
      Number(maxWindow?.maxNext || 1)
    );

    const [created] = await db
      .insert(bookingWindows)
      .values({
        groupId: parsed.data.groupId,
        sectionId: parsed.data.sectionId,
        academicYear,
        specialization,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        capacity: parsed.data.capacity,
        subSection: subSec,
        status: parsed.data.status,
        nextQueueNumber: currentGlobalNext,
        createdBy: session.userId,
      })
      .returning();

    return apiSuccess({ window: created }, "تم إنشاء فترة الحجز بنجاح", 201);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: إدارة فترات الحجز متاحة فقط لمدير النظام", 403);
    }
    return apiError(error.message || "فشل إنشاء فترة الحجز", 400);
  }
}
