import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const res = await p.query(`
    SELECT r.id, r.student_id, s.full_name, s.academic_number, r.rating, r.message, r.type, r.request_campaign_id, r.telegram_message_id, r.created_at
    FROM feedback_ratings r
    LEFT JOIN students s ON r.student_id = s.id
    ORDER BY r.student_id, r.created_at DESC
  `);

  console.log(`Total feedback ratings: ${res.rowCount}`);
  for (const row of res.rows) {
    console.log(`[Rating ${row.id}] Student: ${row.full_name} (${row.academic_number}), Stars: ${row.rating}, Type: ${row.type}, Msg: ${row.message}, Campaign: ${row.request_campaign_id}, Created: ${row.created_at}`);
  }

  // Count duplicates per student
  const dupes = await p.query(`
    SELECT student_id, COUNT(*) as count
    FROM feedback_ratings
    GROUP BY student_id
    HAVING COUNT(*) > 1
  `);
  console.log(`Students with duplicate ratings: ${dupes.rowCount}`);
  for (const d of dupes.rows) {
    console.log(`Student ID: ${d.student_id}, count: ${d.count}`);
  }

  await p.end();
}

main().catch(console.error);
