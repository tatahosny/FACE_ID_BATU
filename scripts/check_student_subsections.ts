import { db } from "../src/db";
import { students } from "../src/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  const distinctSubSections = await db
    .select({
      subSection: students.subSection,
      count: sql<number>`count(*)`,
    })
    .from(students)
    .groupBy(students.subSection);

  console.log("Distinct subSections in students:", distinctSubSections);
  process.exit(0);
}
main().catch(console.error);

