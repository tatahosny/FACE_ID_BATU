import { z } from "zod";

export const createCampaignSchema = z.object({
  title: z.string().trim().min(3, "عنوان الحملة يجب أن لا يقل عن 3 أحرف").max(150),
  message: z.string().trim().min(5, "نص الرسالة يجب أن لا يقل عن 5 أحرف").max(4000),
  targetType: z.enum(["ALL", "GROUP", "SECTION"]),
  targetFilters: z
    .object({
      groupId: z.string().uuid().optional(),
      sectionId: z.string().uuid().optional(),
      subSection: z.enum(["ALL", "A", "B"]).optional(),
    })
    .optional(),
  templateId: z.string().uuid().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(3, "اسم القالب مطلوب").max(100),
  content: z.string().trim().min(5, "محتوى القالب مطلوب").max(4000),
  isActive: z.boolean().default(true),
});

export const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب أن لا تقل عن 6 أحرف"),
});

export const createStaffUserSchema = z.object({
  fullName: z.string().trim().min(3, "الاسم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب أن لا تقل عن 8 خانات"),
  role: z.enum(["STAFF", "SUPER_ADMIN"]).default("STAFF"),
});
