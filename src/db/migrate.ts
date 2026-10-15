import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_PwWrK2l4iyZu@ep-rapid-heart-b5kd9qu2-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

export async function runMigrations() {
  console.log("🚀 Starting database schema migrations for BATU FACE ID...");
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Clean drop of old conflicting tables if they exist
    console.log("🧹 Resetting old or incompatible draft tables...");
    await client.query(`
      DROP TABLE IF EXISTS telegram_campaign_recipients CASCADE;
      DROP TABLE IF EXISTS telegram_campaigns CASCADE;
      DROP TABLE IF EXISTS notification_outbox CASCADE;
      DROP TABLE IF EXISTS telegram_link_tokens CASCADE;
      DROP TABLE IF EXISTS telegram_updates CASCADE;
      DROP TABLE IF EXISTS fingerprint_activations CASCADE;
      DROP TABLE IF EXISTS activation_records CASCADE;
      DROP TABLE IF EXISTS bookings CASCADE;
      DROP TABLE IF EXISTS registrations CASCADE;
      DROP TABLE IF EXISTS booking_windows CASCADE;
      DROP TABLE IF EXISTS section_schedules CASCADE;
      DROP TABLE IF EXISTS schedules CASCADE;
      DROP TABLE IF EXISTS import_batches CASCADE;
      DROP TABLE IF EXISTS students CASCADE;
      DROP TABLE IF EXISTS message_templates CASCADE;
      DROP TABLE IF EXISTS audit_logs CASCADE;
      DROP TABLE IF EXISTS sections CASCADE;
      DROP TABLE IF EXISTS groups CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    console.log("🔨 Creating normalized database tables...");

    // 1. Groups table
    await client.query(`
      CREATE TABLE groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Sections table
    await client.query(`
      CREATE TABLE sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX sections_group_id_idx ON sections(group_id);
    `);

    // 3. Users table
    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE,
        password_hash TEXT,
        role VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
        full_name VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Students table
    await client.query(`
      CREATE TABLE students (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        full_name VARCHAR(255) NOT NULL,
        academic_number VARCHAR(50) NOT NULL UNIQUE,
        national_id_encrypted TEXT NOT NULL,
        national_id_hash VARCHAR(64) NOT NULL UNIQUE,
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
        section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
        telegram_user_id BIGINT UNIQUE,
        telegram_username VARCHAR(100),
        telegram_linked_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX students_academic_number_idx ON students(academic_number);
      CREATE INDEX students_national_id_hash_idx ON students(national_id_hash);
      CREATE INDEX students_group_section_idx ON students(group_id, section_id);
      CREATE INDEX students_telegram_user_idx ON students(telegram_user_id);
    `);

    // 5. Section schedules table
    await client.query(`
      CREATE TABLE section_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX section_schedules_section_date_idx ON section_schedules(section_id, date);
    `);

    // 6. Booking windows table
    await client.query(`
      CREATE TABLE booking_windows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
        section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        capacity INTEGER NOT NULL DEFAULT 50,
        next_queue_number INTEGER NOT NULL DEFAULT 1,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX booking_windows_section_status_idx ON booking_windows(section_id, status);
      CREATE INDEX booking_windows_starts_ends_idx ON booking_windows(starts_at, ends_at);
    `);

    // 7. Bookings table
    await client.query(`
      CREATE TABLE bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_window_id UUID NOT NULL REFERENCES booking_windows(id) ON DELETE RESTRICT,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        queue_number INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
        booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        called_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT bookings_window_queue_unique UNIQUE (booking_window_id, queue_number)
      );
      CREATE INDEX bookings_student_window_idx ON bookings(student_id, booking_window_id);
      CREATE INDEX bookings_status_idx ON bookings(status);
      CREATE INDEX bookings_window_status_idx ON bookings(booking_window_id, status);
    `);

    // 8. Fingerprint Activations table
    await client.query(`
      CREATE TABLE fingerprint_activations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        activated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVATED',
        notes TEXT,
        activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX fingerprint_activations_student_idx ON fingerprint_activations(student_id);
      CREATE INDEX fingerprint_activations_booking_idx ON fingerprint_activations(booking_id);
      CREATE INDEX fingerprint_activations_staff_idx ON fingerprint_activations(activated_by);
    `);

    // 9. Telegram Link Tokens table
    await client.query(`
      CREATE TABLE telegram_link_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX telegram_link_tokens_hash_idx ON telegram_link_tokens(token_hash);
      CREATE INDEX telegram_link_tokens_student_idx ON telegram_link_tokens(student_id);
    `);

    // 10. Telegram Updates table
    await client.query(`
      CREATE TABLE telegram_updates (
        id BIGINT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 11. Notification Outbox table
    await client.query(`
      CREATE TABLE notification_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(50) NOT NULL,
        recipient_id UUID REFERENCES students(id) ON DELETE SET NULL,
        telegram_chat_id BIGINT NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        last_error TEXT,
        idempotency_key VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX notification_outbox_status_attempt_idx ON notification_outbox(status, next_attempt_at);
      CREATE INDEX notification_outbox_idempotency_idx ON notification_outbox(idempotency_key);
    `);

    // 12. Telegram Campaigns table
    await client.query(`
      CREATE TABLE telegram_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_filters JSONB,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        total_recipients INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );
    `);

    // 13. Telegram Campaign Recipients table
    await client.query(`
      CREATE TABLE telegram_campaign_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES telegram_campaigns(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        telegram_user_id BIGINT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
        attempts INTEGER NOT NULL DEFAULT 0,
        sent_at TIMESTAMPTZ,
        last_error TEXT,
        CONSTRAINT campaign_recipient_unique UNIQUE (campaign_id, student_id)
      );
      CREATE INDEX campaign_recipient_status_idx ON telegram_campaign_recipients(campaign_id, status);
    `);

    // 14. Message Templates table
    await client.query(`
      CREATE TABLE message_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 15. Audit Logs table
    await client.query(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id TEXT,
        safe_metadata JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id);
      CREATE INDEX audit_logs_action_idx ON audit_logs(action);
      CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
      CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);
    `);

    await client.query("COMMIT");
    console.log("🎉 All tables, foreign keys, and indexes migrated cleanly to Neon PostgreSQL!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
