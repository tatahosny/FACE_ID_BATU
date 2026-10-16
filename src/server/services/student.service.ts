import { db } from "@/db";
import {
  students,
  sections,
  groups,
  telegramLinkTokens,
  auditLogs,
  fingerprintActivations,
  users,
  bookings,
  telegramCampaignRecipients,
  notificationOutbox,
} from "@/db/schema";
import { eq, or, and, sql, inArray } from "drizzle-orm";
import {
  encryptNationalId,
  decryptNationalId,
  computeNationalIdHash,
  maskNationalId,
  generateSecureToken,
  hashToken,
} from "@/lib/security/crypto";
import { StudentRegistrationInput } from "@/lib/validation/student";
import * as XLSX from "xlsx";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export class StudentService {
  /**
   * Register a new student with transaction safety, National ID encryption, and duplicate checking.
   */
  static async registerStudent(input: StudentRegistrationInput) {
    const { fullName, academicNumber, nationalId, groupId, sectionId, subSection } = input;

    // 1. Verify that selected section belongs to the selected group
    const [section] = await db
      .select()
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.groupId, groupId), eq(sections.isActive, true)));

    if (!section) {
      throw new Error("السكشن المختار لا ينتمي إلى المجموعة المحددة أو غير متاح");
    }

    // 2. Compute keyed HMAC-SHA256 of national ID for zero-knowledge uniqueness check
    const nationalIdHash = computeNationalIdHash(nationalId);

    // 3. Execute atomic transaction for duplicate prevention and registration
    return await db.transaction(async (tx) => {
      // Check existing academic number
      const [existingByAcademic] = await tx
        .select()
        .from(students)
        .where(eq(students.academicNumber, academicNumber));

      if (existingByAcademic) {
        if (
          existingByAcademic.groupId !== groupId ||
          existingByAcademic.sectionId !== sectionId
        ) {
          throw new Error(
            "البيانات مسجلة بالفعل، يرجى مراجعة إدارة الكلية لتعديل القيد الأكاديمي."
          );
        }
        throw new Error("الرقم الأكاديمي مسجل بالفعل في النظام.");
      }

      // Check existing national ID
      const [existingByNationalId] = await tx
        .select()
        .from(students)
        .where(eq(students.nationalIdHash, nationalIdHash));

      if (existingByNationalId) {
        throw new Error("الرقم القومي مسجل بالفعل لطالب آخر.");
      }

      // Encrypt sensitive Egyptian National ID with AES-256-GCM
      const nationalIdEncrypted = encryptNationalId(nationalId);

      // Insert new student
      const [createdStudent] = await tx
        .insert(students)
        .values({
          fullName,
          academicNumber,
          nationalIdEncrypted,
          nationalIdHash,
          groupId,
          sectionId,
          subSection: subSection || "A",
        })
        .returning();

      // Generate single-use Telegram link token (valid for 15 minutes)
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await tx.insert(telegramLinkTokens).values({
        studentId: createdStudent.id,
        tokenHash,
        expiresAt,
      });

      // Record audit log (NEVER store national ID)
      await tx.insert(auditLogs).values({
        action: "STUDENT_REGISTERED",
        entityType: "STUDENT",
        entityId: createdStudent.id,
        safeMetadata: {
          academicNumber,
          groupId,
          sectionId,
          subSection: subSection || "A",
        },
      });

      return {
        student: {
          id: createdStudent.id,
          fullName: createdStudent.fullName,
          academicNumber: createdStudent.academicNumber,
          groupId: createdStudent.groupId,
          sectionId: createdStudent.sectionId,
          createdAt: createdStudent.createdAt,
        },
        telegramLinkToken: rawToken,
        telegramDeepLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || "batu_face_id_bot"}?start=${rawToken}`,
      };
    });
  }

  /**
   * Retrieve student profile by ID without exposing sensitive National ID
   */
  static async getStudentById(id: string) {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    if (!student) return null;

    return {
      id: student.id,
      fullName: student.fullName,
      academicNumber: student.academicNumber,
      groupId: student.groupId,
      sectionId: student.sectionId,
      telegramUserId: student.telegramUserId,
      telegramUsername: student.telegramUsername,
      telegramLinkedAt: student.telegramLinkedAt,
      isActive: student.isActive,
      createdAt: student.createdAt,
    };
  }

  /**
   * Search student by academic number (for Staff and Admin lookups)
   */
  static async getStudentByAcademicNumber(academicNumber: string) {
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.academicNumber, academicNumber.trim()));

    if (!student) return null;

    return {
      id: student.id,
      fullName: student.fullName,
      academicNumber: student.academicNumber,
      groupId: student.groupId,
      sectionId: student.sectionId,
      telegramUserId: student.telegramUserId,
      telegramUsername: student.telegramUsername,
      telegramLinkedAt: student.telegramLinkedAt,
      isActive: student.isActive,
      createdAt: student.createdAt,
    };
  }

  /**
   * Delete student record and clean up associated bookings, tokens, campaign recipients, and activations.
   */
  static async deleteStudent(studentId: string, performedByUserId?: string) {
    return await db.transaction(async (tx) => {
      const [student] = await tx
        .select({
          id: students.id,
          fullName: students.fullName,
          academicNumber: students.academicNumber,
        })
        .from(students)
        .where(eq(students.id, studentId));

      if (!student) {
        throw new Error("سجل الطالب غير موجود");
      }

      // Delete activations
      await tx.delete(fingerprintActivations).where(eq(fingerprintActivations.studentId, studentId));
      // Delete bookings
      await tx.delete(bookings).where(eq(bookings.studentId, studentId));
      // Delete telegram tokens
      await tx.delete(telegramLinkTokens).where(eq(telegramLinkTokens.studentId, studentId));
      // Delete campaign recipient records
      await tx.delete(telegramCampaignRecipients).where(eq(telegramCampaignRecipients.studentId, studentId));
      // Detach notifications
      await tx.update(notificationOutbox).set({ recipientId: null }).where(eq(notificationOutbox.recipientId, studentId));
      // Delete student record
      await tx.delete(students).where(eq(students.id, studentId));

      // Audit log
      if (performedByUserId) {
        await tx.insert(auditLogs).values({
          actorId: performedByUserId,
          action: "DELETE_STUDENT",
          entityType: "student",
          entityId: studentId,
          safeMetadata: {
            fullName: student.fullName,
            academicNumber: student.academicNumber,
            timestamp: new Date().toISOString(),
          },
        });
      }

      return student;
    });
  }

  /**
   * Bulk delete multiple students atomically
   */
  static async bulkDeleteStudents(studentIds: string[], performedByUserId?: string) {
    if (!studentIds || studentIds.length === 0) return 0;

    return await db.transaction(async (tx) => {
      const existingStudents = await tx
        .select({
          id: students.id,
          fullName: students.fullName,
          academicNumber: students.academicNumber,
        })
        .from(students)
        .where(inArray(students.id, studentIds));

      if (existingStudents.length === 0) return 0;

      const ids = existingStudents.map((s) => s.id);

      // Clean up child tables
      await tx.delete(fingerprintActivations).where(inArray(fingerprintActivations.studentId, ids));
      await tx.delete(bookings).where(inArray(bookings.studentId, ids));
      await tx.delete(telegramLinkTokens).where(inArray(telegramLinkTokens.studentId, ids));
      await tx.delete(telegramCampaignRecipients).where(inArray(telegramCampaignRecipients.studentId, ids));
      await tx.update(notificationOutbox).set({ recipientId: null }).where(inArray(notificationOutbox.recipientId, ids));
      await tx.delete(students).where(inArray(students.id, ids));

      if (performedByUserId) {
        await tx.insert(auditLogs).values({
          actorId: performedByUserId,
          action: "BULK_DELETE_STUDENTS",
          entityType: "student",
          entityId: ids[0],
          safeMetadata: {
            deletedCount: ids.length,
            studentNames: existingStudents.map((s) => `${s.fullName} (${s.academicNumber})`),
            timestamp: new Date().toISOString(),
          },
        });
      }

      return ids.length;
    });
  }

  /**
   * Comprehensive student directory listing with group, section, subSection, fingerprint activation, and search filters.
   */
  static async listStudents(params: {
    groupId?: string;
    sectionId?: string;
    subSection?: string; // 'A' | 'B' | 'ALL' | ''
    activationStatus?: string; // 'ACTIVATED' | 'NOT_ACTIVATED' | ''
    staffId?: string;
    activationDate?: string; // 'YYYY-MM-DD'
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (params.groupId) {
      conditions.push(eq(students.groupId, params.groupId));
    }
    if (params.sectionId) {
      conditions.push(eq(students.sectionId, params.sectionId));
    }
    if (params.subSection && params.subSection !== "ALL") {
      conditions.push(eq(students.subSection, params.subSection));
    }
    if (params.search) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          sql`${students.fullName} ILIKE ${term}`,
          sql`${students.academicNumber} ILIKE ${term}`
        )
      );
    }

    if (params.activationStatus === "ACTIVATED") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED')`
      );
    } else if (params.activationStatus === "NOT_ACTIVATED") {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED')`
      );
    }

    if (params.staffId) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED' AND ${fingerprintActivations.activatedBy} = ${params.staffId})`
      );
    }

    if (params.activationDate) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED' AND to_char(${fingerprintActivations.activatedAt} AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') = ${params.activationDate})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rawStudents = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        nationalIdEncrypted: students.nationalIdEncrypted,
        groupId: students.groupId,
        groupName: groups.name,
        sectionId: students.sectionId,
        sectionName: sections.name,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
        telegramUsername: students.telegramUsername,
        telegramLinkedAt: students.telegramLinkedAt,
        isActive: students.isActive,
        createdAt: students.createdAt,
      })
      .from(students)
      .innerJoin(groups, eq(students.groupId, groups.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${students.createdAt} DESC`);

    // Fetch activations for these students
    const studentIds = rawStudents.map((s) => s.id);
    const activationsMap = new Map<string, { activatedAt: Date; staffName: string }>();

    if (studentIds.length > 0) {
      const acts = await db
        .select({
          studentId: fingerprintActivations.studentId,
          activatedAt: fingerprintActivations.activatedAt,
          staffName: users.fullName,
        })
        .from(fingerprintActivations)
        .innerJoin(users, eq(fingerprintActivations.activatedBy, users.id))
        .where(
          and(
            inArray(fingerprintActivations.studentId, studentIds),
            eq(fingerprintActivations.status, "ACTIVATED")
          )
        );

      acts.forEach((a) => {
        activationsMap.set(a.studentId, {
          activatedAt: a.activatedAt,
          staffName: a.staffName,
        });
      });
    }

    const items = rawStudents.map((s) => {
      let nationalId = "غير متوفر";
      try {
        nationalId = decryptNationalId(s.nationalIdEncrypted);
      } catch {
        nationalId = "خطأ في فك التشفير";
      }

      const activation = activationsMap.get(s.id);
      const isActivated = !!activation;

      return {
        id: s.id,
        fullName: s.fullName,
        academicNumber: s.academicNumber,
        nationalId,
        groupId: s.groupId,
        groupName: s.groupName,
        sectionId: s.sectionId,
        sectionName: s.sectionName,
        subSection: s.subSection || "A",
        hasTelegram: !!s.telegramUserId,
        telegramUsername: s.telegramUsername,
        telegramLinkedAt: s.telegramLinkedAt,
        isActive: s.isActive,
        createdAt: s.createdAt,
        isActivated,
        isFingerprintActivated: isActivated,
        activatedAt: activation ? activation.activatedAt : null,
        activatedByStaffName: activation ? activation.staffName : null,
        activatedByName: activation ? activation.staffName : null,
      };
    });

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(whereClause);

    // Global counts across the repository
    const [totalRegResult] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(students);
    const totalRegistered = totalRegResult?.count || 0;

    const [totalActResult] = await db
      .select({ count: sql<number>`cast(count(DISTINCT ${fingerprintActivations.studentId}) as integer)` })
      .from(fingerprintActivations)
      .where(eq(fingerprintActivations.status, "ACTIVATED"));
    const totalActivated = totalActResult?.count || 0;

    const totalNotActivated = Math.max(0, totalRegistered - totalActivated);

    // Calculate count specifically for the selected staff member and/or date
    let filteredStaffDateCount: number | null = null;
    if (params.staffId || params.activationDate) {
      const actFilterConditions = [eq(fingerprintActivations.status, "ACTIVATED")];
      if (params.staffId) {
        actFilterConditions.push(eq(fingerprintActivations.activatedBy, params.staffId));
      }
      if (params.activationDate) {
        actFilterConditions.push(
          sql`to_char(${fingerprintActivations.activatedAt} AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') = ${params.activationDate}`
        );
      }
      const [filterCountResult] = await db
        .select({ count: sql<number>`cast(count(DISTINCT ${fingerprintActivations.studentId}) as integer)` })
        .from(fingerprintActivations)
        .where(and(...actFilterConditions));
      filteredStaffDateCount = filterCountResult?.count || 0;
    }

    return {
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      stats: {
        totalRegistered,
        totalActivated,
        totalNotActivated,
        filteredStaffDateCount,
      },
    };
  }

  /**
   * Export complete Student Directory to a well-formatted Excel workbook (.xlsx)
   * Containing 2 distinct sheets:
   * Sheet 1: "كشف الأسماء بالكامل" (Complete student repository with filters)
   * Sheet 2: "المفعل عندهم البصمة" (Only students with activated face ID / fingerprint)
   */
  static async exportStudentsToExcel(params: {
    groupId?: string;
    sectionId?: string;
    subSection?: string;
    activationStatus?: string;
    staffId?: string;
    activationDate?: string;
    search?: string;
  } = {}) {
    const conditions = [];

    if (params.groupId) {
      conditions.push(eq(students.groupId, params.groupId));
    }
    if (params.sectionId) {
      conditions.push(eq(students.sectionId, params.sectionId));
    }
    if (params.subSection && params.subSection !== "ALL") {
      conditions.push(eq(students.subSection, params.subSection));
    }
    if (params.search) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          sql`${students.fullName} ILIKE ${term}`,
          sql`${students.academicNumber} ILIKE ${term}`
        )
      );
    }

    if (params.activationStatus === "ACTIVATED") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED')`
      );
    } else if (params.activationStatus === "NOT_ACTIVATED") {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED')`
      );
    }

    if (params.staffId) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED' AND ${fingerprintActivations.activatedBy} = ${params.staffId})`
      );
    }

    if (params.activationDate) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED' AND to_char(${fingerprintActivations.activatedAt} AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') = ${params.activationDate})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rawStudents = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        nationalIdEncrypted: students.nationalIdEncrypted,
        groupId: students.groupId,
        groupName: groups.name,
        sectionId: students.sectionId,
        sectionName: sections.name,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
        telegramUsername: students.telegramUsername,
        createdAt: students.createdAt,
      })
      .from(students)
      .innerJoin(groups, eq(students.groupId, groups.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(whereClause)
      .orderBy(sql`${groups.name} ASC`, sql`${sections.name} ASC`, sql`${students.fullName} ASC`);

    const studentIds = rawStudents.map((s) => s.id);
    const activationsMap = new Map<string, { activatedAt: Date; staffName: string }>();

    if (studentIds.length > 0) {
      const acts = await db
        .select({
          studentId: fingerprintActivations.studentId,
          activatedAt: fingerprintActivations.activatedAt,
          staffName: users.fullName,
        })
        .from(fingerprintActivations)
        .innerJoin(users, eq(fingerprintActivations.activatedBy, users.id))
        .where(
          and(
            inArray(fingerprintActivations.studentId, studentIds),
            eq(fingerprintActivations.status, "ACTIVATED")
          )
        );

      acts.forEach((a) => {
        activationsMap.set(a.studentId, {
          activatedAt: a.activatedAt,
          staffName: a.staffName,
        });
      });
    }

    // Build Sheet 1: Full Repository Rows
    const rowsAll = rawStudents.map((s, index) => {
      let nationalId = "غير متوفر";
      try {
        nationalId = decryptNationalId(s.nationalIdEncrypted);
      } catch {
        nationalId = "خطأ في فك التشفير";
      }

      const activation = activationsMap.get(s.id);
      const subSectionLabel = s.subSection === "B" ? "قسم B" : "قسم A";

      return {
        "م": index + 1,
        "اسم الطالب بالكامل": s.fullName,
        "الرقم القومي": nationalId,
        "الرقم الأكاديمي": s.academicNumber,
        "المجموعة الدراسية": s.groupName,
        "السكشن": s.sectionName,
        "القسم الفرعي": subSectionLabel,
        "حالة بصمة الوجه": activation ? "تمت البصمة وتفعيل الوجه" : "قيد الانتظار (لم تبصم بعد)",
        "تاريخ ووقت توثيق البصمة": activation?.activatedAt ? formatCairoDateTime(activation.activatedAt) : "—",
        "الموظف المعتمد للبصمة": activation?.staffName || "—",
        "حالة ربط التيليجرام": s.telegramUserId ? "مرتبط" : "غير مرتبط",
        "معرف التيليجرام": s.telegramUsername ? `@${s.telegramUsername}` : s.telegramUserId ? String(s.telegramUserId) : "—",
        "تاريخ تسجيل الطالب بالمنظومة": formatCairoDateTime(s.createdAt),
      };
    });

    // Build Sheet 2: Only Activated Students Rows
    const activatedStudents = rawStudents.filter((s) => activationsMap.has(s.id));
    const rowsActivated = activatedStudents.map((s, index) => {
      let nationalId = "غير متوفر";
      try {
        nationalId = decryptNationalId(s.nationalIdEncrypted);
      } catch {
        nationalId = "خطأ في فك التشفير";
      }

      const activation = activationsMap.get(s.id)!;
      const subSectionLabel = s.subSection === "B" ? "قسم B" : "قسم A";

      return {
        "م": index + 1,
        "اسم الطالب بالكامل": s.fullName,
        "الرقم القومي": nationalId,
        "الرقم الأكاديمي": s.academicNumber,
        "المجموعة الدراسية": s.groupName,
        "السكشن": s.sectionName,
        "القسم الفرعي": subSectionLabel,
        "حالة الاعتماد": "معتمد ومفعل رسمياً",
        "تاريخ وتوقيت تفعيل البصمة": formatCairoDateTime(activation.activatedAt),
        "الموظف المعتمد للبصمة": activation.staffName,
        "حساب التيليجرام": s.telegramUsername ? `@${s.telegramUsername}` : s.telegramUserId ? String(s.telegramUserId) : "—",
      };
    });

    const worksheetAll = XLSX.utils.json_to_sheet(rowsAll);
    worksheetAll["!views"] = [{ RTL: true }];
    worksheetAll["!cols"] = [
      { wch: 6 },  // م
      { wch: 34 }, // اسم الطالب بالكامل
      { wch: 20 }, // الرقم القومي
      { wch: 18 }, // الرقم الأكاديمي
      { wch: 18 }, // المجموعة الدراسية
      { wch: 14 }, // السكشن
      { wch: 14 }, // القسم الفرعي
      { wch: 28 }, // حالة بصمة الوجه
      { wch: 26 }, // تاريخ ووقت توثيق البصمة
      { wch: 24 }, // الموظف المعتمد للبصمة
      { wch: 18 }, // حالة ربط التيليجرام
      { wch: 22 }, // معرف التيليجرام
      { wch: 26 }, // تاريخ تسجيل الطالب بالمنظومة
    ];

    const worksheetActivated = XLSX.utils.json_to_sheet(rowsActivated);
    worksheetActivated["!views"] = [{ RTL: true }];
    worksheetActivated["!cols"] = [
      { wch: 6 },  // م
      { wch: 34 }, // اسم الطالب بالكامل
      { wch: 20 }, // الرقم القومي
      { wch: 18 }, // الرقم الأكاديمي
      { wch: 18 }, // المجموعة الدراسية
      { wch: 14 }, // السكشن
      { wch: 14 }, // القسم الفرعي
      { wch: 22 }, // حالة الاعتماد
      { wch: 28 }, // تاريخ وتوقيت تفعيل البصمة
      { wch: 24 }, // الموظف المعتمد للبصمة
      { wch: 22 }, // حساب التيليجرام
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheetAll, "كشف الأسماء بالكامل");
    XLSX.utils.book_append_sheet(workbook, worksheetActivated, "المفعل عندهم البصمة");

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  }
}
