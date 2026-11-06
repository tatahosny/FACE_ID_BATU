import { db } from "../src/db";
import { groups, sections, bookingWindows } from "../src/db/schema";
import { eq } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config();

export async function seedAllBookingWindows() {
  console.log("🌱 Ensuring booking windows for all sections across all academic years...");

  const allSections = await db
    .select({
      sectionId: sections.id,
      sectionName: sections.name,
      sectionCode: sections.code,
      groupId: sections.groupId,
      groupName: groups.name,
      academicYear: groups.academicYear,
      specialization: groups.specialization,
    })
    .from(sections)
    .innerJoin(groups, eq(sections.groupId, groups.id));

  const existingBw = await db
    .select({ sectionId: bookingWindows.sectionId })
    .from(bookingWindows);

  const existingSet = new Set(existingBw.map((b) => b.sectionId));
  let insertedCount = 0;

  for (const sec of allSections) {
    if (!existingSet.has(sec.sectionId)) {
      await db.insert(bookingWindows).values({
        groupId: sec.groupId,
        sectionId: sec.sectionId,
        subSection: "ALL",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        capacity: 50,
        status: "CLOSED",
        nextQueueNumber: 1,
      });
      existingSet.add(sec.sectionId);
      insertedCount++;
      console.log(
        `✅ Created booking window for: [${sec.academicYear} ${sec.specialization || ""}] ${sec.groupName} - ${sec.sectionName}`
      );
    }
  }

  console.log(`🎉 Total sections processed: ${allSections.length}. Newly inserted windows: ${insertedCount}`);
}

seedAllBookingWindows()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error seeding booking windows:", err);
    process.exit(1);
  });

