import { db } from "../src/db";
import { bookingWindows } from "../src/db/schema";

async function main() {
  const windows = await db.select().from(bookingWindows);
  console.log("Windows summary:");
  for (const w of windows.slice(0, 5)) {
    console.log({
      id: w.id,
      status: w.status,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      subSection: w.subSection,
    });
  }
  process.exit(0);
}
main().catch(console.error);

