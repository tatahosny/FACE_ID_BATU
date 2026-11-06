import { NextRequest } from "next/server";
import { db } from "@/db";
import { students, groups, sections, telegramLinkTokens } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { createSessionToken, AUTH_COOKIE_NAME } from "@/lib/security/auth";
import { computeNationalIdHash, decryptNationalId, generateSecureToken, hashToken } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    const rateLimit = checkRateLimit(`delegate-login:${ip}`, 15, 5 * 60 * 1000);
    if (!rateLimit.success) {
      return apiError("تم تجاوز عدد محاولات الدخول المسموح بها. يرجى الانتظار بضع دقائق.", 429, "RATE_LIMIT");
    }

    const body = await req.json();
    const { academicNumber, nationalId } = body;

    if (!academicNumber || !nationalId) {
      return apiError("يرجى إدخال الرقم الأكاديمي والرقم القومي (كلمة المرور)", 400);
    }

    // Standardize Arabic-Indic numerals to Latin digits
    const cleanAcademicNumber = academicNumber
      .trim()
      .replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d: string) => String(d.charCodeAt(0) - 1776));

    const cleanNationalId = nationalId
      .trim()
      .replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (d: string) => String(d.charCodeAt(0) - 1776));

    if (!/^\d{14}$/.test(cleanNationalId)) {
      return apiError("الرقم القومي يجب أن يتكون من 14 رقماً", 400);
    }

    // 1. Look up student by academic number
    const [studentRecord] = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        nationalIdEncrypted: students.nationalIdEncrypted,
        nationalIdHash: students.nationalIdHash,
        academicYear: students.academicYear,
        specialization: students.specialization,
        isDelegate: students.isDelegate,
        groupId: students.groupId,
        groupName: groups.name,
        sectionId: students.sectionId,
        sectionName: sections.name,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
        telegramUsername: students.telegramUsername,
      })
      .from(students)
      .innerJoin(groups, eq(students.groupId, groups.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(eq(students.academicNumber, cleanAcademicNumber))
      .limit(1);

    if (!studentRecord) {
      return apiError(
        "لم يتم العثور على طالب مسجل بهذا الرقم الأكاديمي. يرجى الضغط على «تسجيل مندوب جديد» لإنشاء حسابك أولاً.",
        404,
        "STUDENT_NOT_FOUND"
      );
    }

    // 2. Verify National ID (acting as password)
    const expectedHash = computeNationalIdHash(cleanNationalId);
    let isPasswordValid = studentRecord.nationalIdHash === expectedHash;

    // Fallback comparison with decrypted National ID if hash format differs
    if (!isPasswordValid && studentRecord.nationalIdEncrypted) {
      try {
        const decrypted = decryptNationalId(studentRecord.nationalIdEncrypted);
        if (decrypted === cleanNationalId) {
          isPasswordValid = true;
        }
      } catch {
        isPasswordValid = false;
      }
    }

    if (!isPasswordValid) {
      return apiError(
        "الرقم القومي المدخل (كلمة المرور) غير صحيح. يرجى التأكد من الرقم القومي المكون من 14 رقماً.",
        401,
        "INVALID_PASSWORD"
      );
    }

    // 3. Mark student as delegate if not already marked
    if (!studentRecord.isDelegate) {
      await db
        .update(students)
        .set({ isDelegate: true, updatedAt: new Date() })
        .where(eq(students.id, studentRecord.id));
      studentRecord.isDelegate = true;
    }

    // 4. Create authentication session token
    const sessionToken = await createSessionToken({
      userId: studentRecord.id,
      studentId: studentRecord.id,
      fullName: studentRecord.fullName,
      academicNumber: studentRecord.academicNumber,
      groupId: studentRecord.groupId,
      sectionId: studentRecord.sectionId,
      academicYear: studentRecord.academicYear,
      specialization: studentRecord.specialization,
      isDelegate: true,
      role: "STUDENT",
    });

    // 5. Check if Telegram is linked; if not, generate a fresh 15-minute link token
    let telegramDeepLink: string | null = null;
    if (!studentRecord.telegramUserId) {
      const rawToken = generateSecureToken(32);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db.insert(telegramLinkTokens).values({
        studentId: studentRecord.id,
        tokenHash,
        expiresAt,
      });

      const botUsername = process.env.TELEGRAM_BOT_USERNAME || "batu_face_id_bot";
      telegramDeepLink = `https://t.me/${botUsername}?start=${rawToken}`;
    }

    const response = apiSuccess(
      {
        student: {
          id: studentRecord.id,
          fullName: studentRecord.fullName,
          academicNumber: studentRecord.academicNumber,
          academicYear: studentRecord.academicYear || "الفرقة الثالثة",
          specialization: studentRecord.specialization || "سوفت وير",
          groupId: studentRecord.groupId,
          groupName: studentRecord.groupName,
          sectionId: studentRecord.sectionId,
          sectionName: studentRecord.sectionName,
          subSection: studentRecord.subSection || "A",
          isDelegate: true,
          isTelegramLinked: Boolean(studentRecord.telegramUserId),
          telegramUsername: studentRecord.telegramUsername,
        },
        isTelegramLinked: Boolean(studentRecord.telegramUserId),
        telegramDeepLink,
      },
      "تم تسجيل الدخول كمندوب معتمد بنجاح!"
    );

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    return apiError(error.message || "فشل التحقق من بيانات المندوب", 500);
  }
}

