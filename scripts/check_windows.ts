import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  const dupes = await db.execute(sql`
    SELECT section_id, count(*) 
    FROM booking_windows 
    GROUP BY section_id 
    HAVING count(*) > 1
  `);
  console.log("Duplicate section windows:", dupes.rows);

  const sectionsCount = await db.execute(sql`SELECT count(*) FROM sections`);
  console.log("Total sections:", sectionsCount.rows[0].count);
  process.exit(0);
}

main().catch(console.error);
