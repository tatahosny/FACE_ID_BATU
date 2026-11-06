import { pool, db } from "../src/db";
import { groups, sections } from "../src/db/schema";
import { eq } from "drizzle-orm";

export const ACADEMIC_YEARS = [
  "الفرقة الأولى",
  "الفرقة الثانية",
  "الفرقة الثالثة",
  "الفرقة الرابعة",
] as const;

export const SPECIALIZATIONS = [
  "سوفت وير",
  "نيتورك",
] as const;

export const FREE_SLOT_PERIODS = [
  { index: 1, name: "الفترة الأولى", startTime: "09:00", endTime: "09:40" },
  { index: 2, name: "الفترة الثانية", startTime: "09:40", endTime: "10:20" },
  { index: 3, name: "الفترة الثالثة", startTime: "10:20", endTime: "11:00" },
  { index: 4, name: "الفترة الرابعة", startTime: "11:00", endTime: "11:40" },
  { index: 5, name: "الفترة الخامسة", startTime: "11:40", endTime: "12:20" },
  { index: 6, name: "الفترة السادسة", startTime: "12:20", endTime: "01:00" },
  { index: 7, name: "الفترة السابعة", startTime: "01:00", endTime: "01:40" },
  { index: 8, name: "الفترة الثامنة", startTime: "01:40", endTime: "02:20" },
  { index: 9, name: "الفترة التاسعة", startTime: "02:20", endTime: "03:00" },
] as const;

async function seed() {
  console.log("🌱 Starting academic seeding...");

  // 1. Ensure existing Year 2 groups have correct academicYear
  await db
    .update(groups)
    .set({ academicYear: "الفرقة الثانية" })
    .where(eq(groups.academicYear, "الفرقة الثانية"));

  // 2. Define Groups to Seed
  const groupsToSeed = [
    // Year 1
    {
      name: "المجموعة الأولى (الفرقة الأولى)",
      code: "Y1-G1",
      academicYear: "الفرقة الأولى",
      specialization: null,
      sections: [
        { name: "السكشن 1", code: "SEC-Y1-G1-1" },
        { name: "السكشن 2", code: "SEC-Y1-G1-2" },
        { name: "السكشن 3", code: "SEC-Y1-G1-3" },
        { name: "السكشن 4", code: "SEC-Y1-G1-4" },
      ],
    },
    {
      name: "المجموعة الثانية (الفرقة الأولى)",
      code: "Y1-G2",
      academicYear: "الفرقة الأولى",
      specialization: null,
      sections: [
        { name: "السكشن 1", code: "SEC-Y1-G2-1" },
        { name: "السكشن 2", code: "SEC-Y1-G2-2" },
        { name: "السكشن 3", code: "SEC-Y1-G2-3" },
        { name: "السكشن 4", code: "SEC-Y1-G2-4" },
      ],
    },
    {
      name: "المجموعة الثالثة (الفرقة الأولى)",
      code: "Y1-G3",
      academicYear: "الفرقة الأولى",
      specialization: null,
      sections: [
        { name: "السكشن 1", code: "SEC-Y1-G3-1" },
        { name: "السكشن 2", code: "SEC-Y1-G3-2" },
        { name: "السكشن 3", code: "SEC-Y1-G3-3" },
        { name: "السكشن 4", code: "SEC-Y1-G3-4" },
      ],
    },

    // Year 3 - Software
    {
      name: "جروب 1 (سوفت وير)",
      code: "Y3-SW-G1",
      academicYear: "الفرقة الثالثة",
      specialization: "سوفت وير",
      sections: [
        { name: "السكشن 1", code: "SEC-Y3-SW-G1-1" },
        { name: "السكشن 2", code: "SEC-Y3-SW-G1-2" },
        { name: "السكشن 3", code: "SEC-Y3-SW-G1-3" },
        { name: "السكشن 4", code: "SEC-Y3-SW-G1-4" },
      ],
    },
    {
      name: "جروب 2 (سوفت وير)",
      code: "Y3-SW-G2",
      academicYear: "الفرقة الثالثة",
      specialization: "سوفت وير",
      sections: [
        { name: "السكشن 1", code: "SEC-Y3-SW-G2-1" },
        { name: "السكشن 2", code: "SEC-Y3-SW-G2-2" },
        { name: "السكشن 3", code: "SEC-Y3-SW-G2-3" },
        { name: "السكشن 4", code: "SEC-Y3-SW-G2-4" },
      ],
    },

    // Year 3 - Network
    {
      name: "جروب 1 (نيتورك)",
      code: "Y3-NET-G1",
      academicYear: "الفرقة الثالثة",
      specialization: "نيتورك",
      sections: [
        { name: "السكشن 1", code: "SEC-Y3-NET-G1-1" },
        { name: "السكشن 2", code: "SEC-Y3-NET-G1-2" },
        { name: "السكشن 3", code: "SEC-Y3-NET-G1-3" },
        { name: "السكشن 4", code: "SEC-Y3-NET-G1-4" },
      ],
    },
    {
      name: "جروب 2 (نيتورك)",
      code: "Y3-NET-G2",
      academicYear: "الفرقة الثالثة",
      specialization: "نيتورك",
      sections: [
        { name: "السكشن 1", code: "SEC-Y3-NET-G2-1" },
        { name: "السكشن 2", code: "SEC-Y3-NET-G2-2" },
        { name: "السكشن 3", code: "SEC-Y3-NET-G2-3" },
        { name: "السكشن 4", code: "SEC-Y3-NET-G2-4" },
      ],
    },

    // Year 4 - Software
    {
      name: "جروب 1 (سوفت وير)",
      code: "Y4-SW-G1",
      academicYear: "الفرقة الرابعة",
      specialization: "سوفت وير",
      sections: [
        { name: "السكشن 1", code: "SEC-Y4-SW-G1-1" },
        { name: "السكشن 2", code: "SEC-Y4-SW-G1-2" },
        { name: "السكشن 3", code: "SEC-Y4-SW-G1-3" },
        { name: "السكشن 4", code: "SEC-Y4-SW-G1-4" },
      ],
    },
    {
      name: "جروب 2 (سوفت وير)",
      code: "Y4-SW-G2",
      academicYear: "الفرقة الرابعة",
      specialization: "سوفت وير",
      sections: [
        { name: "السكشن 1", code: "SEC-Y4-SW-G2-1" },
        { name: "السكشن 2", code: "SEC-Y4-SW-G2-2" },
        { name: "السكشن 3", code: "SEC-Y4-SW-G2-3" },
        { name: "السكشن 4", code: "SEC-Y4-SW-G2-4" },
      ],
    },

    // Year 4 - Network
    {
      name: "جروب 1 (نيتورك)",
      code: "Y4-NET-G1",
      academicYear: "الفرقة الرابعة",
      specialization: "نيتورك",
      sections: [
        { name: "السكشن 1", code: "SEC-Y4-NET-G1-1" },
        { name: "السكشن 2", code: "SEC-Y4-NET-G1-2" },
        { name: "السكشن 3", code: "SEC-Y4-NET-G1-3" },
        { name: "السكشن 4", code: "SEC-Y4-NET-G1-4" },
      ],
    },
    {
      name: "جروب 2 (نيتورك)",
      code: "Y4-NET-G2",
      academicYear: "الفرقة الرابعة",
      specialization: "نيتورك",
      sections: [
        { name: "السكشن 1", code: "SEC-Y4-NET-G2-1" },
        { name: "السكشن 2", code: "SEC-Y4-NET-G2-2" },
        { name: "السكشن 3", code: "SEC-Y4-NET-G2-3" },
        { name: "السكشن 4", code: "SEC-Y4-NET-G2-4" },
      ],
    },
  ];

  for (const g of groupsToSeed) {
    let [groupRecord] = await db.select().from(groups).where(eq(groups.code, g.code));
    if (!groupRecord) {
      [groupRecord] = await db
        .insert(groups)
        .values({
          name: g.name,
          code: g.code,
          academicYear: g.academicYear,
          specialization: g.specialization,
        })
        .returning();
      console.log(`✅ Seeded group: ${g.name} (${g.code}) [${g.academicYear}]`);
    } else {
      await db
        .update(groups)
        .set({
          academicYear: g.academicYear,
          specialization: g.specialization,
        })
        .where(eq(groups.id, groupRecord.id));
      console.log(`ℹ️ Updated group: ${g.name} (${g.code})`);
    }

    for (const s of g.sections) {
      const [secRecord] = await db.select().from(sections).where(eq(sections.code, s.code));
      if (!secRecord) {
        await db.insert(sections).values({
          groupId: groupRecord.id,
          name: s.name,
          code: s.code,
        });
        console.log(`   + Seeded section: ${s.name} (${s.code})`);
      }
    }
  }

  console.log("🎉 Academic seeding completed successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
