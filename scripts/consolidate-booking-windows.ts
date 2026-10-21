import { db } from "../src/db";
import { groups, sections, bookingWindows, bookings, users } from "../src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

async function consolidate() {
  console.log("🚀 Starting Booking Windows Consolidation...");

  // 1. Fetch all groups and sections
  const allGroups = await db.select().from(groups).orderBy(groups.code);
  const allSections = await db.select().from(sections).orderBy(sections.code);
  const existingWindows = await db.select().from(bookingWindows);

  // Find admin user for createdBy
  const [adminUser] = await db.select().from(users).limit(1);
  const adminId = adminUser?.id;

  console.log(`Found ${allGroups.length} groups, ${allSections.length} sections, and ${existingWindows.length} existing booking windows.`);

  // For each of the 12 sections, pick the canonical window or create one if missing
  const canonicalWindowIds: string[] = [];
  const windowsToDelete: string[] = [];

  for (const section of allSections) {
    const windowsForSection = existingWindows.filter(w => w.sectionId === section.id);

    if (windowsForSection.length === 0) {
      // Create a new default window for this section
      const [newWindow] = await db
        .insert(bookingWindows)
        .values({
          groupId: section.groupId,
          sectionId: section.id,
          subSection: "ALL",
          status: "CLOSED",
          capacity: 50,
          startsAt: new Date(Date.now() - 3600000),
          endsAt: new Date(Date.now() + 30 * 24 * 3600000),
          createdBy: adminId,
          nextQueueNumber: 1,
        })
        .returning();

      console.log(`✨ Created missing window for ${section.name} (Group ${section.groupId}): ${newWindow.id}`);
      canonicalWindowIds.push(newWindow.id);
    } else {
      // Pick the best canonical window:
      // Prefer OPEN window if any, otherwise the most recently updated one
      const openWindow = windowsForSection.find(w => w.status === "OPEN");
      const canonical = openWindow || windowsForSection.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      canonicalWindowIds.push(canonical.id);

      // Re-link any bookings on duplicate windows to the canonical window
      const otherWindowIds = windowsForSection
        .filter(w => w.id !== canonical.id)
        .map(w => w.id);

      if (otherWindowIds.length > 0) {
        // Check if there are bookings to re-link
        await db
          .update(bookings)
          .set({ bookingWindowId: canonical.id })
          .where(inArray(bookings.bookingWindowId, otherWindowIds));

        windowsToDelete.push(...otherWindowIds);
      }
    }
  }

  // Delete all duplicate windows
  if (windowsToDelete.length > 0) {
    console.log(`🗑️ Deleting ${windowsToDelete.length} duplicate booking windows...`);
    await db.delete(bookingWindows).where(inArray(bookingWindows.id, windowsToDelete));
    console.log(`✅ Successfully deleted ${windowsToDelete.length} duplicate windows.`);
  }

  // Final verification
  const finalWindows = await db
    .select({
      id: bookingWindows.id,
      groupName: groups.name,
      sectionName: sections.name,
      status: bookingWindows.status,
      capacity: bookingWindows.capacity,
      subSection: bookingWindows.subSection,
    })
    .from(bookingWindows)
    .innerJoin(groups, eq(bookingWindows.groupId, groups.id))
    .innerJoin(sections, eq(bookingWindows.sectionId, sections.id))
    .orderBy(groups.code, sections.code);

  console.log(`\n🎉 Final Booking Windows Count: ${finalWindows.length} (Expected: 12)`);
  console.table(finalWindows);
}

consolidate().catch(console.error);
