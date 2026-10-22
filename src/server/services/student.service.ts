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
    const rawFullName = input.fullName.trim();
    // Normalize any Arabic-Indic digits (٠-٩) to standard English digits
    const rawAcademicNumber = input.academicNumber
      .trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
    const rawNationalId = input.nationalId
      .trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
    const { groupId, sectionId, subSection } = input;

    // 1. Verify that selected section belongs to the selected group
    const [section] = await db
      .select()
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.groupId, groupId), eq(sections.isActive, true)));

    if (!section) {
      throw new Error("السكشن المختار لا ينتمي إلى المجموعة المحددة أو غير متاح");
    }

    // 2. Compute keyed HMAC-SHA256 of national ID for zero-knowledge uniqueness check
    const nationalIdHash = computeNationalIdHash(rawNationalId);

    // 3. Execute atomic transaction for duplicate prevention and registration
    return await db.transaction(async (tx) => {
      // Check existing by academic number (case and whitespace insensitive)
      const [existingByAcademic] = await tx
        .select()
        .from(students)
        .where(sql`LOWER(TRIM(${students.academicNumber})) = LOWER(TRIM(${rawAcademicNumber}))`);

      // Check existing by national ID hash
      const [existingByNationalId] = await tx
        .select()
        .from(students)
        .where(eq(students.nationalIdHash, nationalIdHash));

      // CASE 1: Student is already registered in the system AND both Academic Number & National ID match!
      // This is the student reclaiming/updating their account or linking Telegram!
      const isOwnerReclaiming =
        (existingByAcademic && existingByAcademic.nationalIdHash === nationalIdHash) ||
        (existingByNationalId && existingByAcademic && existingByNationalId.id === existingByAcademic.id);

      if (isOwnerReclaiming && existingByAcademic) {
        // Update student's group, section, and subSection to their current selection
        const [updatedStudent] = await tx
          .update(students)
          .set({
            fullName: rawFullName,
            groupId,
            sectionId,
            subSection: subSection || existingByAcademic.subSection || "A",
            updatedAt: new Date(),
          })
          .where(eq(students.id, existingByAcademic.id))
          .returning();

        // Generate fresh single-use Telegram link token (valid for 15 minutes)
        const rawToken = generateSecureToken(32);
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await tx.insert(telegramLinkTokens).values({
          studentId: updatedStudent.id,
          tokenHash,
          expiresAt,
        });

        // Record audit log
        await tx.insert(auditLogs).values({
          action: "STUDENT_PROFILE_UPDATED",
          entityType: "STUDENT",
          entityId: updatedStudent.id,
          safeMetadata: {
            academicNumber: rawAcademicNumber,
            groupId,
            sectionId,
            subSection: subSection || "A",
            updatedViaRegistrationForm: true,
          },
        });

        return {
          student: {
            id: updatedStudent.id,
            fullName: updatedStudent.fullName,
            academicNumber: updatedStudent.academicNumber,
            groupId: updatedStudent.groupId,
            sectionId: updatedStudent.sectionId,
            createdAt: updatedStudent.createdAt,
            isExistingUpdated: true,
          },
          telegramLinkToken: rawToken,
          telegramDeepLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || "batu_face_id_bot"}?start=${rawToken}`,
        };
      }

      // CASE 2: Academic Number is taken, but National ID does NOT match
      if (existingByAcademic && existingByAcademic.nationalIdHash !== nationalIdHash) {
        throw new Error(
          "الرقم الأكاديمي مسجل بالفعل في المنظومة برقم قومي مختلف. يرجى مراجعة إدارة الكلية لتصحيح القيد أو التأكد من الأرقام المدخلة."
        );
      }

      // CASE 3: National ID is taken by another academic number
      if (existingByNationalId && existingByNationalId.academicNumber !== rawAcademicNumber) {
        throw new Error(
          `الرقم القومي المدخل مسجل بالفعل لطالب آخر برقم أكاديمي (${existingByNationalId.academicNumber}). يرجى التأكد من الرقم القومي الخاص بك.`
        );
      }

      // CASE 4: Completely brand new student registration
      const nationalIdEncrypted = encryptNationalId(rawNationalId);

      const [createdStudent] = await tx
        .insert(students)
        .values({
          fullName: rawFullName,
          academicNumber: rawAcademicNumber,
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

      // Record audit log
      await tx.insert(auditLogs).values({
        action: "STUDENT_REGISTERED",
        entityType: "STUDENT",
        entityId: createdStudent.id,
        safeMetadata: {
          academicNumber: rawAcademicNumber,
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
          isExistingUpdated: false,
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
   * Manual student creation/update by Super Admin with optional overwrite approval.
   */
  static async manualUpsertStudent(input: {
    fullName: string;
    nationalId: string;
    academicNumber: string;
    groupId: string;
    sectionId: string;
    subSection: string;
    isFingerprintActivated?: boolean;
    overwrite?: boolean;
    performedByUserId?: string;
  }) {
    const rawFullName = input.fullName.trim();
    const rawAcademicNumber = input.academicNumber
      .trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
    const rawNationalId = input.nationalId
      .trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
    const { groupId, sectionId, subSection, overwrite, isFingerprintActivated, performedByUserId } = input;

    if (!rawFullName || rawFullName.length < 3) {
      throw new Error("يرجى إدخال اسم الطالب ثلاثي أو رباعي بشكل صحيح");
    }
    if (!/^\d{14}$/.test(rawNationalId)) {
      throw new Error("الرقم القومي يجب أن يتكون من 14 رقماً بالضبط");
    }
    if (!rawAcademicNumber || rawAcademicNumber.length < 3) {
      throw new Error("يرجى إدخال الرقم الأكاديمي بشكل صحيح");
    }

    // Verify section belongs to group
    const [section] = await db
      .select({ id: sections.id, name: sections.name, groupId: sections.groupId })
      .from(sections)
      .where(and(eq(sections.id, sectionId), eq(sections.groupId, groupId)));

    if (!section) {
      throw new Error("السكشن المختار لا ينتمي للمجموعة المحددة");
    }

    const [group] = await db
      .select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(eq(groups.id, groupId));

    const nationalIdHash = computeNationalIdHash(rawNationalId);

    return await db.transaction(async (tx) => {
      // Find existing by academic number OR by nationalIdHash
      const [existingByAcademic] = await tx
        .select({
          student: students,
          groupName: groups.name,
          sectionName: sections.name,
        })
        .from(students)
        .leftJoin(groups, eq(students.groupId, groups.id))
        .leftJoin(sections, eq(students.sectionId, sections.id))
        .where(sql`LOWER(TRIM(${students.academicNumber})) = LOWER(TRIM(${rawAcademicNumber}))`);

      const [existingByNationalId] = await tx
        .select({
          student: students,
          groupName: groups.name,
          sectionName: sections.name,
        })
        .from(students)
        .leftJoin(groups, eq(students.groupId, groups.id))
        .leftJoin(sections, eq(students.sectionId, sections.id))
        .where(eq(students.nationalIdHash, nationalIdHash));

      const existingRecord = existingByAcademic || existingByNationalId;

      // If existing student found and NOT confirmed for overwrite yet:
      if (existingRecord && !overwrite) {
        // Fetch if fingerprint is currently activated for this existing student
        const [act] = await tx
          .select({ id: fingerprintActivations.id, activatedAt: fingerprintActivations.activatedAt })
          .from(fingerprintActivations)
          .where(and(eq(fingerprintActivations.studentId, existingRecord.student.id), eq(fingerprintActivations.status, "ACTIVATED")));

        let existingDecryptedNid = "—";
        try {
          existingDecryptedNid = decryptNationalId(existingRecord.student.nationalIdEncrypted);
        } catch {}

        return {
          conflict: true,
          message: "يوجد طالب مسجل بالفعل بنفس الرقم الأكاديمي أو الرقم القومي في المنظومة",
          existingStudent: {
            id: existingRecord.student.id,
            fullName: existingRecord.student.fullName,
            academicNumber: existingRecord.student.academicNumber,
            nationalId: existingDecryptedNid,
            groupName: existingRecord.groupName || "—",
            sectionName: existingRecord.sectionName || "—",
            subSection: existingRecord.student.subSection || "A",
            isActivated: Boolean(act),
            activatedAt: act?.activatedAt ? formatCairoDateTime(act.activatedAt) : null,
          },
          newData: {
            fullName: rawFullName,
            academicNumber: rawAcademicNumber,
            nationalId: rawNationalId,
            groupName: group?.name || "—",
            sectionName: section.name,
            subSection: subSection || "A",
            isFingerprintActivated: Boolean(isFingerprintActivated),
          },
        };
      }

      const nationalIdEncrypted = encryptNationalId(rawNationalId);

      // If overwrite approved on existing student
      if (existingRecord && overwrite) {
        const studentIdToUpdate = existingRecord.student.id;

        // If another student record has this national ID or academic number, resolve conflict
        if (existingByNationalId && existingByNationalId.student.id !== studentIdToUpdate) {
          await tx.delete(fingerprintActivations).where(eq(fingerprintActivations.studentId, existingByNationalId.student.id));
          await tx.delete(bookings).where(eq(bookings.studentId, existingByNationalId.student.id));
          await tx.delete(telegramLinkTokens).where(eq(telegramLinkTokens.studentId, existingByNationalId.student.id));
          await tx.delete(students).where(eq(students.id, existingByNationalId.student.id));
        }

        const [updatedStudent] = await tx
          .update(students)
          .set({
            fullName: rawFullName,
            academicNumber: rawAcademicNumber,
            nationalIdEncrypted,
            nationalIdHash,
            groupId,
            sectionId,
            subSection: subSection || "A",
            updatedAt: new Date(),
          })
          .where(eq(students.id, studentIdToUpdate))
          .returning();

        // Handle fingerprint activation status if specified
        if (isFingerprintActivated !== undefined) {
          if (isFingerprintActivated) {
            const [existingAct] = await tx
              .select({ id: fingerprintActivations.id })
              .from(fingerprintActivations)
              .where(and(eq(fingerprintActivations.studentId, updatedStudent.id), eq(fingerprintActivations.status, "ACTIVATED")));

            if (!existingAct && performedByUserId) {
              await tx.insert(fingerprintActivations).values({
                studentId: updatedStudent.id,
                activatedBy: performedByUserId,
                status: "ACTIVATED",
                notes: "تم التفعيل المباشر أثناء الإدخال اليدوي للبيانات",
              });
            }
          } else {
            await tx.delete(fingerprintActivations).where(eq(fingerprintActivations.studentId, updatedStudent.id));
          }
        }

        if (performedByUserId) {
          await tx.insert(auditLogs).values({
            actorId: performedByUserId,
            action: "MANUAL_STUDENT_OVERWRITE",
            entityType: "student",
            entityId: updatedStudent.id,
            safeMetadata: {
              fullName: rawFullName,
              academicNumber: rawAcademicNumber,
              groupId,
              sectionId,
              subSection,
              overwritten: true,
            },
          });
        }

        return {
          conflict: false,
          action: "UPDATED",
          student: updatedStudent,
          message: `تم استبدال وتحديث بيانات الطالب "${updatedStudent.fullName}" بنجاح!`,
        };
      }

      // Brand new student insertion
      const [newStudent] = await tx
        .insert(students)
        .values({
          fullName: rawFullName,
          academicNumber: rawAcademicNumber,
          nationalIdEncrypted,
          nationalIdHash,
          groupId,
          sectionId,
          subSection: subSection || "A",
        })
        .returning();

      if (isFingerprintActivated && performedByUserId) {
        await tx.insert(fingerprintActivations).values({
          studentId: newStudent.id,
          activatedBy: performedByUserId,
          status: "ACTIVATED",
          notes: "تم التفعيل المباشر أثناء الإدخال اليدوي",
        });
      }

      if (performedByUserId) {
        await tx.insert(auditLogs).values({
          actorId: performedByUserId,
          action: "MANUAL_STUDENT_CREATED",
          entityType: "student",
          entityId: newStudent.id,
          safeMetadata: {
            fullName: rawFullName,
            academicNumber: rawAcademicNumber,
            groupId,
            sectionId,
            subSection,
          },
        });
      }

      return {
        conflict: false,
        action: "CREATED",
        student: newStudent,
        message: `تم إضافة الطالب الجديد "${newStudent.fullName}" إلى دليل الطلاب بنجاح!`,
      };
    });
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

  /**
   * Export ONLY students with activated biometrics to Excel.
   * Specific columns strictly requested by administration:
   * [الاسم, الرقم الأكاديمي, المجموعة, السكشن, الرقم القومي]
   */
  static async exportActivatedStudentsOnlyToExcel(params: {
    groupId?: string;
    sectionId?: string;
    subSection?: string;
    staffId?: string;
    activationDate?: string;
    search?: string;
  } = {}) {
    const conditions = [];

    // Strictly students with activated biometrics
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${fingerprintActivations} WHERE ${fingerprintActivations.studentId} = ${students.id} AND ${fingerprintActivations.status} = 'ACTIVATED')`
    );

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

    const whereClause = and(...conditions);

    const activatedList = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        nationalIdEncrypted: students.nationalIdEncrypted,
        groupName: groups.name,
        sectionName: sections.name,
      })
      .from(students)
      .innerJoin(groups, eq(students.groupId, groups.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(whereClause)
      .orderBy(sql`${groups.name} ASC`, sql`${sections.name} ASC`, sql`${students.fullName} ASC`);

    const rows = activatedList.map((s, index) => {
      let nationalId = "غير متوفر";
      try {
        nationalId = decryptNationalId(s.nationalIdEncrypted);
      } catch {
        nationalId = "خطأ في فك التشفير";
      }

      return {
        "م": index + 1,
        "الاسم": s.fullName,
        "الرقم الأكاديمي": s.academicNumber,
        "المجموعة": s.groupName,
        "السكشن": s.sectionName,
        "الرقم القومي": nationalId,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!views"] = [{ RTL: true }];
    worksheet["!cols"] = [
      { wch: 6 },  // م
      { wch: 34 }, // الاسم
      { wch: 18 }, // الرقم الأكاديمي
      { wch: 16 }, // المجموعة
      { wch: 14 }, // السكشن
      { wch: 22 }, // الرقم القومي
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "الطلاب المفعلين للبصمة");

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  }

  /**
   * Generates a downloadable blank/sample Excel template for importing activated students.
   */
  static generateImportTemplate(): Buffer {
    const sampleRows = [
      {
        "الاسم": "أحمد محمد عبد الله حسن",
        "الرقم الأكاديمي": "20241001",
        "الرقم القومي": "30401011234567",
        "المجموعة (اختياري)": "",
        "السكشن (اختياري)": "",
      },
      {
        "الاسم": "سارة إبراهيم محمود السيد",
        "الرقم الأكاديمي": "20241002",
        "الرقم القومي": "30402021234568",
        "المجموعة (اختياري)": "",
        "السكشن (اختياري)": "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    worksheet["!views"] = [{ RTL: true }];
    worksheet["!cols"] = [
      { wch: 32 }, // الاسم
      { wch: 20 }, // الرقم الأكاديمي
      { wch: 22 }, // الرقم القومي
      { wch: 20 }, // المجموعة
      { wch: 18 }, // السكشن
    ];

    const instructions = [
      { "تعليمات مهمة": "1. الأعمدة الأساسية الإلزامية هي: [الاسم]، [الرقم الأكاديمي]، و [الرقم القومي]." },
      { "تعليمات مهمة": "2. بمجرد رفع هذا الملف، سيتم تفعيل بصمة الوجه للطلاب تلقائياً واعتمادهم بالمنظومة فوراً." },
      { "تعليمات مهمة": "3. إذا كان الطالب موجوداً بالمنظومة وبصمته مفعلة بالفعل، سيتم تجاهله دون تكرار أو تعديل." },
      { "تعليمات مهمة": "4. إذا كان الطالب مسجلاً مسبقاً ولكن بصمته غير مفعلة، سيتم تفعيل بصمته فوراً." },
      { "تعليمات مهمة": "5. إذا لم يكن الطالب مسجلاً بالمنظومة، ستتم إضافته إلى دليل الطلاب وتفعيل بصمته مباشرة." },
      { "تعليمات مهمة": "6. في حال ترك خانة المجموعة أو السكشن فارغة، سيتم تسكين الطالب تلقائياً في المجموعة الافتراضية المحددة." },
    ];

    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    instructionsSheet["!views"] = [{ RTL: true }];
    instructionsSheet["!cols"] = [{ wch: 90 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "بيانات تفعيل البصمة");
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "إرشادات الاستيراد");

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  }

  /**
   * Imports students from an uploaded Excel file, adding new students and activating their biometrics,
   * activating biometrics for unactivated existing students, and skipping already-activated students.
   */
  static async importActivatedStudentsFromExcel(params: {
    buffer: Buffer;
    performedByUserId: string;
    defaultGroupId?: string;
    defaultSectionId?: string;
  }) {
    const workbook = XLSX.read(params.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("ملف الإكسيل فارغ ولا يحتوي على أي أوراق عمل (Sheets).");
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], {
      defval: "",
    });

    if (!rawRows || rawRows.length === 0) {
      throw new Error("ملف الإكسيل لا يحتوي على أي صفوف بيانات.");
    }

    // Helper to normalize digits
    const normalizeDigits = (val: any): string => {
      if (val === null || val === undefined) return "";
      return String(val)
        .trim()
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
    };

    const getField = (row: Record<string, any>, possibleKeys: string[]): string => {
      for (const k of Object.keys(row)) {
        const cleanK = k.trim().toLowerCase().replace(/[\s_\-]/g, "");
        for (const pk of possibleKeys) {
          const cleanPk = pk.trim().toLowerCase().replace(/[\s_\-]/g, "");
          if (cleanK === cleanPk || cleanK.includes(cleanPk)) {
            return String(row[k] || "").trim();
          }
        }
      }
      return "";
    };

    // Preload groups and sections for fallback
    const allGroups = await db.select().from(groups).where(eq(groups.isActive, true));
    const allSections = await db.select().from(sections).where(eq(sections.isActive, true));

    let fallbackGroupId = params.defaultGroupId;
    if (!fallbackGroupId || !allGroups.some((g) => g.id === fallbackGroupId)) {
      fallbackGroupId = allGroups[0]?.id;
    }

    let fallbackSectionId = params.defaultSectionId;
    if (!fallbackSectionId || !allSections.some((s) => s.id === fallbackSectionId)) {
      fallbackSectionId = allSections.find((s) => s.groupId === fallbackGroupId)?.id || allSections[0]?.id;
    }

    if (!fallbackGroupId || !fallbackSectionId) {
      throw new Error("يجب توفر مجموعة وسكشن واحدة على الأقل في النظام لتسكين الطلاب الجدد.");
    }

    let insertedAndActivated = 0;
    let activatedExisting = 0;
    let skippedAlreadyActivated = 0;
    const errors: Array<{ rowNumber: number; reason: string }> = [];

    // Process rows sequentially
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // header is row 1

      const rawFullName = getField(row, ["الاسم", "اسم الطالب", "اسم الطالب بالكامل", "الاسم بالكامل", "name", "fullname"]);
      const rawAcademicNumber = normalizeDigits(
        getField(row, ["الرقم الأكاديمي", "الرقم الاكاديمي", "رقم الجلوس", "كود الطالب", "academicnumber", "academic_number"])
      );
      const rawNationalId = normalizeDigits(
        getField(row, ["الرقم القومي", "الرقم القومى", "بطاقة الرقم القومي", "nationalid", "national_id"])
      );

      // Skip completely empty rows
      if (!rawFullName && !rawAcademicNumber && !rawNationalId) {
        continue;
      }

      if (!rawFullName || rawFullName.length < 3) {
        errors.push({ rowNumber: rowNum, reason: `اسم الطالب غير صحيح أو مفقود: "${rawFullName}"` });
        continue;
      }

      if (!rawAcademicNumber || rawAcademicNumber.length < 3) {
        errors.push({ rowNumber: rowNum, reason: `الرقم الأكاديمي مفقود أو غير صالح للطالب: "${rawFullName}"` });
        continue;
      }

      if (!rawNationalId || rawNationalId.length < 10) {
        errors.push({ rowNumber: rowNum, reason: `الرقم القومي غير صالح (يجب أن يكون 14 رقماً أو رقم هوية سليم): "${rawNationalId}"` });
        continue;
      }

      try {
        const nationalIdHash = computeNationalIdHash(rawNationalId);

        // Check if student exists by academicNumber or nationalIdHash
        const [existingStudent] = await db
          .select()
          .from(students)
          .where(or(eq(students.academicNumber, rawAcademicNumber), eq(students.nationalIdHash, nationalIdHash)));

        if (existingStudent) {
          // Check if biometrics is already activated
          const [activeBiometric] = await db
            .select({ id: fingerprintActivations.id })
            .from(fingerprintActivations)
            .where(
              and(
                eq(fingerprintActivations.studentId, existingStudent.id),
                eq(fingerprintActivations.status, "ACTIVATED")
              )
            );

          if (activeBiometric) {
            // Already activated -> skip as per user rule
            skippedAlreadyActivated++;
          } else {
            // Student exists but biometrics not activated -> activate now!
            await db.insert(fingerprintActivations).values({
              studentId: existingStudent.id,
              activatedBy: params.performedByUserId,
              status: "ACTIVATED",
              notes: "تم التفعيل عبر استيراد شيت إكسيل للبصمات المسبقة",
            });

            await db.insert(auditLogs).values({
              actorId: params.performedByUserId,
              action: "EXCEL_STUDENT_BIOMETRIC_ACTIVATED",
              entityType: "student",
              entityId: existingStudent.id,
              safeMetadata: {
                academicNumber: existingStudent.academicNumber,
                fullName: existingStudent.fullName,
              },
            });

            activatedExisting++;
          }
        } else {
          // Student does not exist -> insert new student and activate biometric!
          const nationalIdEncrypted = encryptNationalId(rawNationalId);

          // Resolve group and section if specified in row, else fallback
          const rowGroupName = getField(row, ["المجموعة", "المجموعة الدراسية", "group"]);
          const rowSectionName = getField(row, ["السكشن", "القسم", "section"]);

          let targetGroupId = fallbackGroupId;
          let targetSectionId = fallbackSectionId;

          if (rowGroupName) {
            const matchedG = allGroups.find(
              (g) => g.name.toLowerCase().includes(rowGroupName.toLowerCase()) || rowGroupName.includes(g.name)
            );
            if (matchedG) {
              targetGroupId = matchedG.id;
              const matchedSec = allSections.find((s) => s.groupId === targetGroupId);
              if (matchedSec) targetSectionId = matchedSec.id;
            }
          }

          if (rowSectionName) {
            const matchedS = allSections.find(
              (s) => s.groupId === targetGroupId && (s.name.includes(rowSectionName) || rowSectionName.includes(s.name))
            );
            if (matchedS) targetSectionId = matchedS.id;
          }

          const [newStudent] = await db
            .insert(students)
            .values({
              fullName: rawFullName,
              academicNumber: rawAcademicNumber,
              nationalIdEncrypted,
              nationalIdHash,
              groupId: targetGroupId,
              sectionId: targetSectionId,
              subSection: "A",
            })
            .returning();

          await db.insert(fingerprintActivations).values({
            studentId: newStudent.id,
            activatedBy: params.performedByUserId,
            status: "ACTIVATED",
            notes: "تم تسجيل الطالب وتفعيل البصمة مباشرة عبر استيراد شيت الإكسيل",
          });

          await db.insert(auditLogs).values({
            actorId: params.performedByUserId,
            action: "EXCEL_STUDENT_CREATED_AND_ACTIVATED",
            entityType: "student",
            entityId: newStudent.id,
            safeMetadata: {
              academicNumber: newStudent.academicNumber,
              fullName: newStudent.fullName,
            },
          });

          insertedAndActivated++;
        }
      } catch (rowErr: any) {
        errors.push({
          rowNumber: rowNum,
          reason: rowErr.message || "حدث خطأ أثناء معالجة صف الطالب",
        });
      }
    }

    return {
      totalRows: rawRows.length,
      insertedAndActivated,
      activatedExisting,
      skippedAlreadyActivated,
      errors,
    };
  }
}
