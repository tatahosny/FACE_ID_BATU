import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, bookings } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { SettingsService } from "@/server/services/settings.service";
import { BookingService } from "@/server/services/booking.service";
import { NotificationService } from "@/server/services/notification.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    // 1. Get desk assignments and active statuses
    const assignments = await SettingsService.getDeskStaff();
    const deskStatuses = await SettingsService.getDeskStatuses();

    // 2. Fetch list of available staff and super_admins
    const staffMembers = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(inArray(users.role, [USER_ROLES.STAFF, USER_ROLES.SUPER_ADMIN]))
      .orderBy(users.fullName);

    // 3. Count waiting and called per desk
    const queueStats = await db
      .select({
        desk: bookings.desk,
        status: bookings.status,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(sql`${bookings.status} IN ('WAITING', 'CALLED')`)
      .groupBy(bookings.desk, bookings.status);

    const stats = {
      T: { waiting: 0, called: 0 },
      D: { waiting: 0, called: 0 },
    };

    queueStats.forEach((row) => {
      const d = (row.desk === "D" ? "D" : "T") as "T" | "D";
      if (row.status === "WAITING") {
        stats[d].waiting += Number(row.count || 0);
      } else if (row.status === "CALLED") {
        stats[d].called += Number(row.count || 0);
      }
    });

    const staffMap = new Map(staffMembers.map((s) => [s.id, s.fullName]));

    return apiSuccess({
      desks: {
        T: {
          desk: "T",
          name: "شباك T",
          staffId: assignments.deskT,
          staffName: assignments.deskT ? staffMap.get(assignments.deskT) || "غير محدد" : "غير محدد",
          waiting: stats.T.waiting,
          called: stats.T.called,
          isActive: deskStatuses.deskTActive,
        },
        D: {
          desk: "D",
          name: "شباك D",
          staffId: assignments.deskD,
          staffName: assignments.deskD ? staffMap.get(assignments.deskD) || "غير محدد" : "غير محدد",
          waiting: stats.D.waiting,
          called: stats.D.called,
          isActive: deskStatuses.deskDActive,
        },
      },
      staffList: staffMembers,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذا الإجراء يتطلب صلاحية إدارية", 403);
    }
    return apiError(error.message || "فشل جلب بيانات الشبابيك", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);
    const body = await req.json();
    const { desk, staffId, action, isActive } = body;

    if (desk !== "T" && desk !== "D") {
      return apiError("رمز الشباك غير صالح، يجب أن يكون T أو D", 400);
    }

    // 1. Toggle Window Status (Activate / Deactivate Window)
    if (action === "toggle-status" || typeof isActive === "boolean") {
      const targetIsActive = typeof isActive === "boolean" ? isActive : Boolean(body.active);
      const otherDesk: "T" | "D" = desk === "T" ? "D" : "T";
      const currentStatuses = await SettingsService.getDeskStatuses();

      // Guard: Cannot deactivate both desks simultaneously
      if (!targetIsActive) {
        const isOtherActive = otherDesk === "T" ? currentStatuses.deskTActive : currentStatuses.deskDActive;
        if (!isOtherActive) {
          return apiError("لا يمكن إغلاق كلا الشباكين معاً. يجب أن يبقى شباك واحد على الأقل مفعلاً لاستقبال الطلاب.", 400);
        }
      }

      // Update setting in database
      await SettingsService.setDeskStatus(desk, targetIsActive, session.userId);

      // If deactivating, automatically migrate all active (WAITING/CALLED) tickets from this desk to the active desk
      let movedCount = 0;
      if (!targetIsActive) {
        movedCount = await BookingService.migrateDeskBookings(desk, otherDesk);
        NotificationService.checkAndQueueProximityNotifications().catch(console.error);
      }

      const message = targetIsActive
        ? `تم فتح وتفعيل شباك ${desk} بنجاح، وأصبح جاهزاً لاستقبال الحجوزات بالتناوب.`
        : `تم إيقاف تفعيل وقفل شباك ${desk} بنجاح، وتم تحويل جميع الأدوار والتذاكر المتبقية (${movedCount} دور) تلقائياً إلى شباك ${otherDesk}.`;

      return apiSuccess(
        {
          desk,
          isActive: targetIsActive,
          movedCount,
          targetDesk: !targetIsActive ? otherDesk : null,
        },
        message
      );
    }

    // 2. Assign staff to desk (Super Admin only)
    if (staffId !== undefined) {
      if (session.role !== USER_ROLES.SUPER_ADMIN) {
        return apiError("غير مصرح: فقط مدير النظام يمكنه تغيير موظفي الشبابيك", 403);
      }

      if (!staffId) {
        return apiError("يرجى اختيار الموظف المسؤول عن الشباك", 400);
      }

      await SettingsService.setDeskStaff(desk, staffId, session.userId);

      return apiSuccess(
        { desk, staffId },
        `تم تعيين الموظف المسؤول عن شباك ${desk} بنجاح`
      );
    }

    return apiError("الإجراء المطلوب غير محدد أو غير صالح", 400);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذا الإجراء يتطلب صلاحية إدارية", 403);
    }
    return apiError(error.message || "فشل تنفيذ العملية على الشباك", 500);
  }
}
