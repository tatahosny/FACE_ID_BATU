import { NextRequest, NextResponse } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const buffer = StudentService.generateImportTemplate();

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="BATU_Fingerprint_Import_Template.xlsx"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتحميل قالب الاستيراد", 403, "FORBIDDEN");
    }
    return apiError(error.message || "فشل تحميل قالب الاستيراد", 500);
  }
}
