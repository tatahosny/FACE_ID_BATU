import { db } from "../src/db";
import { bookingWindows } from "../src/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const distinctSubSections = await db
    .select({
      subSection: bookingWindows.subSection,
      count: sql<number>`count(*)`,
    })
    .from(bookingWindows)
    .groupBy(bookingWindows.subSection);

  console.log("Distinct subSections in bookingWindows:", distinctSubSections);
  process.exit(0);
}
main().catch(console.error);

