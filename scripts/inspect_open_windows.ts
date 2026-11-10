import { db } from "../src/db";
import { bookingWindows, sections, groups } from "../src/db/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const windows = await db
    .select({
      id: bookingWindows.id,
      sectionId: bookingWindows.sectionId,
      sectionName: sections.name,
      groupName: groups.name,
      subSection: bookingWindows.subSection,
      status: bookingWindows.status,
      startsAt: bookingWindows.startsAt,
      endsAt: bookingWindows.endsAt,
    })
    .from(bookingWindows)
    .innerJoin(sections, eq(bookingWindows.sectionId, sections.id))
    .innerJoin(groups, eq(sections.groupId, groups.id))
    .orderBy(desc(bookingWindows.status));

  console.log(`Total windows: ${windows.length}`);
  const openWindows = windows.filter(w => w.status === 'OPEN');
  console.log(`Open windows: ${openWindows.length}`);
  console.log(openWindows.slice(0, 10));

  const now = new Date();
  const openExpired = openWindows.filter(w => new Date(w.endsAt) < now || new Date(w.startsAt) > now);
  console.log(`Open windows with invalid date range relative to now: ${openExpired.length}`);
  if (openExpired.length > 0) {
    console.log(openExpired);
  }
  process.exit(0);
}
main().catch(console.error);

