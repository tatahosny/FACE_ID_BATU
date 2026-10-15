import { db } from "@/db";
import {
  students,
  bookings,
  fingerprintActivations,
  bookingWindows,
  sections,
  groups,
  notificationOutbox,
  auditLogs,
  users,
} from "@/db/schema";
import { eq, and, sql, isNotNull, isNull, desc } from "drizzle-orm";
import { BOOKING_STATUSES } from "@/lib/constants/statuses";

export class AdminService {
  /**
   * Comprehensive administration dashboard statistics
   */
  static async getDashboardStats() {
    // 1. Total students count
    const [{ totalStudents }] = await db
      .select({ totalStudents: sql<number>`cast(count(*) as integer)` })
      .from(students);

    // 2. Telegram linking metrics
    const [{ linkedTelegramCount }] = await db
      .select({ linkedTelegramCount: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(isNotNull(students.telegramUserId));

    const unlinkedTelegramCount = totalStudents - linkedTelegramCount;

    // 3. Bookings counts by status
    const bookingCounts = await db
      .select({
        status: bookings.status,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(bookings)
      .groupBy(bookings.status);

    const bookingStatusMap: Record<string, number> = {
      [BOOKING_STATUSES.WAITING]: 0,
      [BOOKING_STATUSES.CALLED]: 0,
      [BOOKING_STATUSES.IN_PROGRESS]: 0,
      [BOOKING_STATUSES.COMPLETED]: 0,
      [BOOKING_STATUSES.CANCELLED]: 0,
      [BOOKING_STATUSES.NO_SHOW]: 0,
    };

    let totalBookings = 0;
    for (const b of bookingCounts) {
      bookingStatusMap[b.status] = b.count;
      totalBookings += b.count;
    }

    // 4. Fingerprint activations count
    const [{ totalActivations }] = await db
      .select({ totalActivations: sql<number>`cast(count(*) as integer)` })
      .from(fingerprintActivations)
      .where(eq(fingerprintActivations.status, "ACTIVATED"));

    // 5. Students per group
    const studentsPerGroup = await db
      .select({
        groupId: groups.id,
        groupName: groups.name,
        groupCode: groups.code,
        count: sql<number>`cast(count(${students.id}) as integer)`,
      })
      .from(groups)
      .leftJoin(students, eq(groups.id, students.groupId))
      .groupBy(groups.id, groups.name, groups.code);

    // 6. Students per section
    const studentsPerSection = await db
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        sectionCode: sections.code,
        groupId: sections.groupId,
        count: sql<number>`cast(count(${students.id}) as integer)`,
      })
      .from(sections)
      .leftJoin(students, eq(sections.id, students.sectionId))
      .groupBy(sections.id, sections.name, sections.code, sections.groupId);

    // 7. Notification stats
    const outboxCounts = await db
      .select({
        status: notificationOutbox.status,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(notificationOutbox)
      .groupBy(notificationOutbox.status);

    const notificationStats = {
      pending: 0,
      delivered: 0,
      failed: 0,
    };

    for (const o of outboxCounts) {
      if (o.status === "PENDING" || o.status === "PROCESSING") notificationStats.pending += o.count;
      if (o.status === "DELIVERED") notificationStats.delivered += o.count;
      if (o.status === "FAILED") notificationStats.failed += o.count;
    }

    // 8. Active booking windows count
    const [{ activeWindowsCount }] = await db
      .select({ activeWindowsCount: sql<number>`cast(count(*) as integer)` })
      .from(bookingWindows)
      .where(eq(bookingWindows.status, "OPEN"));

    return {
      students: {
        total: totalStudents,
        linkedTelegram: linkedTelegramCount,
        unlinkedTelegram: unlinkedTelegramCount,
        perGroup: studentsPerGroup,
        perSection: studentsPerSection,
      },
      bookings: {
        total: totalBookings,
        waiting: bookingStatusMap[BOOKING_STATUSES.WAITING],
        called: bookingStatusMap[BOOKING_STATUSES.CALLED],
        inProgress: bookingStatusMap[BOOKING_STATUSES.IN_PROGRESS],
        completed: bookingStatusMap[BOOKING_STATUSES.COMPLETED],
        cancelled: bookingStatusMap[BOOKING_STATUSES.CANCELLED],
        noShow: bookingStatusMap[BOOKING_STATUSES.NO_SHOW],
      },
      activations: {
        total: totalActivations,
      },
      notifications: notificationStats,
      windows: {
        active: activeWindowsCount,
      },
    };
  }

  /**
   * Paginated audit logs retrieval
   */
  static async getAuditLogs(page = 1, limit = 25) {
    const offset = (page - 1) * limit;

    const items = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        safeMetadata: auditLogs.safeMetadata,
        actorName: users.fullName,
        actorRole: users.role,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(auditLogs);

    return {
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }
}
