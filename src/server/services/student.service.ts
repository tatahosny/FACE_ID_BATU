import { db } from "@/db";
import { students, sections, groups, telegramLinkTokens, auditLogs, fingerprintActivations, users } from "@/db/schema";
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

export class StudentService {
  /**
   * Register a new student with transaction safety, National ID encryption, and duplicate checking.
   */
  static async registerStudent(input: StudentRegistrationInput) {
    const { fullName, academicNumber, nationalId, groupId, sectionId } = input;

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
   * Comprehensive student directory listing with group, section, fingerprint activation, and search filters.
   */
  static async listStudents(params: {
    groupId?: string;
    sectionId?: string;
    activationStatus?: string; // 'ACTIVATED' | 'NOT_ACTIVATED' | ''
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

    return {
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }
}
