import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function runCleanup() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log("=== بدء فحص وتنظيف التقييمات المتكررة في قاعدة البيانات ===");

  // Find duplicates by student_id and request_campaign_id (treating null as matching)
  // or overall per student
  const findDuplicatesQuery = `
    WITH ranked_ratings AS (
      SELECT
        r.id,
        r.student_id,
        s.full_name,
        s.academic_number,
        r.rating,
        r.message,
        r.type,
        r.request_campaign_id,
        r.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY r.student_id, COALESCE(r.request_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY 
            CASE WHEN r.message IS NOT NULL AND TRIM(r.message) <> '' THEN 1 ELSE 2 END ASC,
            r.created_at DESC,
            r.id DESC
        ) as rank_num
      FROM feedback_ratings r
      LEFT JOIN students s ON r.student_id = s.id
    )
    SELECT * FROM ranked_ratings
    WHERE student_id IN (
      SELECT student_id
      FROM feedback_ratings
      GROUP BY student_id, COALESCE(request_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      HAVING COUNT(*) > 1
    )
    ORDER BY student_id, rank_num;
  `;

  const duplicateRows = await pool.query(findDuplicatesQuery);
  console.log(`إجمالي السجلات التابعة للطلاب الذين لديهم تكرار: ${duplicateRows.rowCount}`);

  const toDeleteIds: string[] = [];
  for (const row of duplicateRows.rows) {
    if (row.rank_num === 1) {
      console.log(`[إبقاء] الطالب: ${row.full_name} (${row.academic_number}) - تقييم ID: ${row.id} - نجوم: ${row.rating} - رسالة: ${row.message || 'بدون'} - تاريخ: ${row.created_at}`);
    } else {
      console.log(`[حذف تكرار] الطالب: ${row.full_name} (${row.academic_number}) - تقييم ID: ${row.id} - نجوم: ${row.rating} - تاريخ: ${row.created_at}`);
      toDeleteIds.push(row.id);
    }
  }

  if (toDeleteIds.length > 0) {
    console.log(`جارٍ حذف ${toDeleteIds.length} تقييم مكرر...`);
    const deleteRes = await pool.query(
      `DELETE FROM feedback_ratings WHERE id = ANY($1::uuid[])`,
      [toDeleteIds]
    );
    console.log(`✅ تم بنجاح حذف ${deleteRes.rowCount} تقييم مكرر من قاعدة البيانات.`);
  } else {
    console.log("لا توجد تقييمات مكررة لحذفها.");
  }

  // Also check if any duplicate exists across all campaigns for same student
  const overallDuplicates = await pool.query(`
    SELECT student_id, COUNT(*) as count
    FROM feedback_ratings
    GROUP BY student_id
    HAVING COUNT(*) > 1
  `);
  console.log(`الطلاب الذين لديهم أكثر من تقييم واحد إجمالاً الآن: ${overallDuplicates.rowCount}`);

  // Add Unique Index to prevent future duplicates at DB level
  console.log("جارٍ إنشاء الفهرس الفريد لمنع تكرار التقييمات في قاعدة البيانات مستقبلاً...");
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "feedback_ratings_student_campaign_uidx"
    ON feedback_ratings (student_id, COALESCE(request_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid));
  `);
  console.log("✅ تم إنشاء الفهرس الفريد (UNIQUE INDEX) بنجاح.");

  // Also verify total remaining ratings
  const countRes = await pool.query("SELECT COUNT(*) as total FROM feedback_ratings");
  console.log(`إجمالي التقييمات المتبقية والفريدة في النظام: ${countRes.rows[0].total}`);

  await pool.end();
  console.log("=== اكتمل التنظيف بنجاح ===");
}

runCleanup().catch((err) => {
  console.error("خطأ أثناء التنظيف:", err);
  process.exit(1);
});
