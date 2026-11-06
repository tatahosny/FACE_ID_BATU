import { pool, db } from "../src/db";

async function run() {
  const client = await pool.connect();
  try {
    console.log("⏳ Starting migration...");
    await client.query("BEGIN");

    // 1. Add columns to groups
    await client.query(`
      ALTER TABLE groups 
      ADD COLUMN IF NOT EXISTS academic_year varchar(50) DEFAULT 'الفرقة الثانية' NOT NULL,
      ADD COLUMN IF NOT EXISTS specialization varchar(50);
    `);

    // 2. Add columns to students
    await client.query(`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS academic_year varchar(50) DEFAULT 'الفرقة الثانية' NOT NULL,
      ADD COLUMN IF NOT EXISTS specialization varchar(50),
      ADD COLUMN IF NOT EXISTS is_delegate boolean DEFAULT false NOT NULL;
    `);

    // 3. Add columns to section_schedules
    await client.query(`
      ALTER TABLE section_schedules 
      ADD COLUMN IF NOT EXISTS academic_year varchar(50) DEFAULT 'الفرقة الثانية',
      ADD COLUMN IF NOT EXISTS specialization varchar(50);
    `);

    // 4. Add columns to booking_windows
    await client.query(`
      ALTER TABLE booking_windows 
      ADD COLUMN IF NOT EXISTS academic_year varchar(50) DEFAULT 'الفرقة الثانية',
      ADD COLUMN IF NOT EXISTS specialization varchar(50);
    `);

    // 5. Create delegate_slot_days table
    await client.query(`
      CREATE TABLE IF NOT EXISTS delegate_slot_days (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        day_name varchar(50) NOT NULL UNIQUE,
        day_index integer NOT NULL,
        is_open boolean DEFAULT false NOT NULL,
        academic_year varchar(50) DEFAULT 'الفرقة الثالثة' NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    // 6. Create section_free_slots table
    await client.query(`
      CREATE TABLE IF NOT EXISTS section_free_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        academic_year varchar(50) DEFAULT 'الفرقة الثالثة' NOT NULL,
        specialization varchar(50) NOT NULL,
        group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        delegate_student_id uuid REFERENCES students(id) ON DELETE SET NULL,
        delegate_name varchar(255) NOT NULL,
        day_name varchar(50) NOT NULL,
        period_index integer NOT NULL,
        period_name varchar(50) NOT NULL,
        start_time varchar(20) NOT NULL,
        end_time varchar(20) NOT NULL,
        notes text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT unique_slot_per_spec UNIQUE (specialization, day_name, period_index)
      );
    `);

    // 7. Seed initial delegate_slot_days
    const days = [
      { name: "السبت", index: 1, isOpen: true },
      { name: "الأحد", index: 2, isOpen: true },
      { name: "الإثنين", index: 3, isOpen: true },
      { name: "الثلاثاء", index: 4, isOpen: true },
      { name: "الأربعاء", index: 5, isOpen: true },
      { name: "الخميس", index: 6, isOpen: false },
    ];

    for (const d of days) {
      await client.query(
        `INSERT INTO delegate_slot_days (day_name, day_index, is_open)
         VALUES ($1, $2, $3)
         ON CONFLICT (day_name) DO NOTHING;`,
        [d.name, d.index, d.isOpen]
      );
    }

    await client.query("COMMIT");
    console.log("✅ Database schema migration executed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

run();

