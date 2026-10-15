import { NextRequest } from "next/server";
import { BookingService } from "@/server/services/booking.service";
import { NotificationService } from "@/server/services/notification.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { updateBookingStatusSchema } from "@/lib/validation/booking";
import { apiError, apiSuccess } from "@/lib/utils/response";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);
    const bookingId = params.id;

    const body = await req.json();
    const parsed = updateBookingStatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const updated = await BookingService.transitionStatus(
      bookingId,
      parsed.data.status,
      session.userId,
      parsed.data.notes
    );

    // If a student was called or completed, advance and evaluate queue proximity notifications asynchronously
    if (parsed.data.status === "CALLED" || parsed.data.status === "COMPLETED") {
      NotificationService.checkAndQueueProximityNotifications(updated.bookingWindowId).catch(console.error);
    }

    return apiSuccess({ booking: updated }, "تم تحديث حالة الدور بنجاح");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتغيير حالة الدور", 403);
    }
    return apiError(error.message || "فشل تحديث حالة الدور", 400);
  }
}
