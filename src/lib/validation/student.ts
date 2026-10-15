import { z } from "zod";

const EGYPTIAN_GOV_CODES = new Set([
  "01", "02", "03", "04", "11", "12", "13", "14", "15", "16",
  "17", "18", "19", "21", "22", "23", "24", "25", "26", "27",
  "28", "29", "31", "32", "33", "34", "35", "88",
]);

/**
 * Validates Egyptian National ID format and logical rules:
 * - 14 digits
 * - Century: 2 (1900-1999) or 3 (2000-2099)
 * - Valid month (01-12)
 * - Valid day (01-31)
 * - Valid Egyptian governorate code
 */
export function isValidEgyptianNationalId(id: string): boolean {
  if (!/^\d{14}$/.test(id)) return false;

  const century = id[0];
  if (century !== "2" && century !== "3") return false;

  const month = parseInt(id.substring(3, 5), 10);
  if (month < 1 || month > 12) return false;

  const day = parseInt(id.substring(5, 7), 10);
  if (day < 1 || day > 31) return false;

  const govCode = id.substring(7, 9);
  if (!EGYPTIAN_GOV_CODES.has(govCode)) return false;

  return true;
}

export const studentRegistrationSchema = z.object({
  fullName: z
    .string({ required_error: "يرجى إدخال الاسم الرباعي" })
    .trim()
    .min(6, "الاسم يجب أن لا يقل عن 6 أحرف")
    .max(100, "الاسم يجب ألا يتجاوز 100 حرف")
    .refine((val) => val.split(/\s+/).length >= 3, {
      message: "يرجى كتابة الاسم الثلاثي أو الرباعي على الأقل",
    }),
  academicNumber: z
    .string({ required_error: "يرجى إدخال الرقم الأكاديمي / رقم القيد" })
    .trim()
    .min(4, "الرقم الأكاديمي يجب أن لا يقل عن 4 أرقام/رموز")
    .max(30, "الرقم الأكاديمي غير صالح")
    .regex(/^[a-zA-Z0-9\-_]+$/, "الرقم الأكاديمي يحتوي على رموز غير مسموحة"),
  nationalId: z
    .string({ required_error: "يرجى إدخال الرقم القومي" })
    .trim()
    .length(14, "الرقم القومي يجب أن يتكون من 14 رقماً بالضبط")
    .regex(/^\d{14}$/, "الرقم القومي يجب أن يحتوي على أرقام فقط")
    .refine(isValidEgyptianNationalId, {
      message: "الرقم القومي غير صالح وفقاً لمعايير الهيئة المصرية",
    }),
  groupId: z
    .string({ required_error: "يرجى اختيار المجموعة الأكاديمية" })
    .uuid("معرف المجموعة غير صالح"),
  sectionId: z
    .string({ required_error: "يرجى اختيار السكشن الأكاديمي" })
    .uuid("معرف السكشن غير صالح"),
});

export type StudentRegistrationInput = z.infer<typeof studentRegistrationSchema>;
