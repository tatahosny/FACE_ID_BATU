import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookingWindows, groups, sections, bookings } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { createBookingWindowSchema } from "@/lib/validation/booking";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sectionId = searchParams.get("sectionId");

    const query = db
      .select({
        id: bookingWindows.id,
        groupId: bookingWindows.groupId,
        groupName: groups.name,
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
      .orderBy(desc(bookingWindows.createdAt));

    if (sectionId) {
      query.where(eq(bookingWindows.sectionId, sectionId));
    }

    const items = await query;

    // Calculate booked counts
    const formatted = items.map((w) => ({
      ...w,
      bookedCount: Math.max(0, w.nextQueueNumber - 1),
      remainingCapacity: Math.max(0, w.capacity - (w.nextQueueNumber - 1)),
    }));

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

    const [created] = await db
      .insert(bookingWindows)
      .values({
        groupId: parsed.data.groupId,
        sectionId: parsed.data.sectionId,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        capacity: parsed.data.capacity,
        subSection: parsed.data.subSection || "ALL",
        status: parsed.data.status,
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
