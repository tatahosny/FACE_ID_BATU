import { db } from "../src/db";
import { groups, sections, students, bookingWindows, sectionSchedules, bookings } from "../src/db/schema";
import { sql, eq } from "drizzle-orm";

async function main() {
  console.log("=== GROUPS ===");
  const allGroups = await db.select().from(groups);
  for (const g of allGroups) {
    console.log(`Group: id=${g.id}, name="${g.name}", code="${g.code}"`);
  }

  console.log("\n=== SECTIONS ===");
  const allSections = await db.select().from(sections);
  for (const s of allSections) {
    const grp = allGroups.find(g => g.id === s.groupId);
    console.log(`Section: id=${s.id}, groupId=${s.groupId} (${grp?.name}), name="${s.name}", code="${s.code}", isActive=${s.isActive}`);
  }

  console.log("\n=== BOOKING WINDOWS AND BOOKINGS ===");
  const windows = await db.select().from(bookingWindows);
  const bookingCounts = await db
    .select({
      windowId: bookings.bookingWindowId,
      count: sql`count(*)::int`,
    })
    .from(bookings)
    .groupBy(bookings.bookingWindowId);

  const countMap = new Map(bookingCounts.map(b => [b.windowId, Number(b.count)]));

  for (const w of windows) {
    const grp = allGroups.find(g => g.id === w.groupId);
    const sec = allSections.find(s => s.id === w.sectionId);
    const bCount = countMap.get(w.id) || 0;
    console.log(`Window: id=${w.id}, group=${grp?.name}, section=${sec?.name}, subSec=${w.subSection}, status=${w.status}, capacity=${w.capacity}, bookings=${bCount}, created=${w.createdAt}`);
  }
}

main().catch(console.error);
