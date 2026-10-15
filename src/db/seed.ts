import { db } from "./index";
import { groups, sections, users, messageTemplates } from "./schema";
import { INITIAL_BATU_GROUPS, INITIAL_BATU_SECTIONS } from "@/lib/constants/academic";
import { hashPassword } from "@/lib/security/auth";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config();

export async function seedDatabase() {
  console.log("🌱 Starting BATU Face ID System database seed...");

  // 1. Seed Groups
  const groupMap = new Map<string, string>(); // code -> id

  for (const g of INITIAL_BATU_GROUPS) {
    const [existing] = await db.select().from(groups).where(eq(groups.code, g.code));
    if (existing) {
      console.log(`ℹ️ Group already exists: ${g.name} (${g.code})`);
      groupMap.set(g.code, existing.id);
    } else {
      const [inserted] = await db
        .insert(groups)
        .values({ name: g.name, code: g.code })
        .returning();
      console.log(`✅ Seeded group: ${g.name} (${g.code})`);
      groupMap.set(g.code, inserted.id);
    }
  }

  // 2. Seed Sections (4 per group, 12 in total)
  for (const s of INITIAL_BATU_SECTIONS) {
    const groupId = groupMap.get(s.groupCode);
    if (!groupId) {
      console.warn(`⚠️ Warning: Group ID not found for code ${s.groupCode}`);
      continue;
    }

    const [existing] = await db.select().from(sections).where(eq(sections.code, s.code));
    if (existing) {
      console.log(`ℹ️ Section already exists: ${s.name} (${s.code})`);
    } else {
      await db.insert(sections).values({
        groupId,
        name: s.name,
        code: s.code,
      });
      console.log(`✅ Seeded section: ${s.name} (${s.code})`);
    }
  }

  // 3. Seed Initial Super Admin
  const adminEmail = process.env.SUPER_ADMIN_INITIAL_EMAIL || "admin@batu.edu.eg";
  const adminPassword = process.env.SUPER_ADMIN_INITIAL_PASSWORD || "BatuAdmin@2026#Secure";

  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail));

  if (!existingAdmin) {
    const passwordHash = await hashPassword(adminPassword);
    await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      fullName: "مدير النظام العام (Super Admin)",
      role: "SUPER_ADMIN",
    });
    console.log(`✅ Created initial Super Admin: ${adminEmail}`);
  } else {
    console.log(`ℹ️ Super Admin already exists: ${adminEmail}`);
  }

  // 4. Seed Message Templates
  const initialTemplates = [
    {
      name: "فتح باب الحجز للسكشن",
      content:
        "📢 تم فتح باب حجز مواعيد تسجيل بصمة الوجه للسكشن الخاص بك الآن عبر المنصة الإلكترونية.\nيرجى الدخول وحجز رقمك في قائمة الانتظار.",
    },
    {
      name: "إغلاق باب الحجز للسكشن",
      content:
        "⚠️ تم إغلاق باب حجز مواعيد بصمة الوجه لهذه الفترة.\nيرجى متابعة إعلانات الكلية للفترات القادمة.",
    },
    {
      name: "تذكير بالموعد وإحضار بطاقة الرقم القومي",
      content:
        "🔔 تذكير هام لجميع الطلاب المتوجهين لمكتب البصمة اليوم:\nيرجى إحضار أصل بطاقة الرقم القومي أو كارنيه الكلية لإتمام التفعيل.",
    },
    {
      name: "تعديل جدول الحضور",
      content:
        "📅 تنبيه: تم إجراء تعديل على مواعيد الحضور للسكشن، يرجى مراجعة الجدول المحدث على المنصة.",
    },
  ];

  for (const t of initialTemplates) {
    const [existing] = await db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.name, t.name));

    if (!existing) {
      await db.insert(messageTemplates).values(t);
      console.log(`✅ Seeded template: ${t.name}`);
    }
  }

  console.log("🎉 Database seeding completed successfully!");
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seed failed:", err);
      process.exit(1);
    });
}
