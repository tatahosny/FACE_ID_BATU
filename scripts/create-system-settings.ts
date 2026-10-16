import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Setting up system_settings table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key VARCHAR(100) NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Insert default activation location if not exists
  await db.execute(sql`
    INSERT INTO system_settings (key, value, description)
    VALUES (
      'activation_location',
      'معمل الحاسب الآلي الرئيسي (شباك بصمة الوجه)',
      'المقر المعتمد لتسجيل بصمة الوجه المرسل في إشعار التيليجرام للطلاب'
    )
    ON CONFLICT (key) DO NOTHING;
  `);

  console.log("system_settings table and default activation_location ready!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
