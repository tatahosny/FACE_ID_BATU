import { NextRequest, NextResponse } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Only Staff and Super Admin can export student directories
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId") || undefined;
    const sectionId = searchParams.get("sectionId") || undefined;
    const subSection = searchParams.get("subSection") || undefined;
    const activationStatus = searchParams.get("activationStatus") || undefined;
    const search = searchParams.get("search") || undefined;

    const buffer = await StudentService.exportStudentsToExcel({
      groupId,
      sectionId,
      subSection,
      activationStatus,
      search,
    });

    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `BATU_Students_Directory_${dateStr}.xlsx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتصدير كشف بيانات الطلاب", 403, "FORBIDDEN");
    }
    return apiError(error.message || "فشل تصدير كشف الطلاب إلى إكسيل", 500);
  }
}
