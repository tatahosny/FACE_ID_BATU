/**
 * Migration: Add GPS and Device Lock columns
 * - booking_windows: open_latitude, open_longitude
 * - bookings: device_id, device_ip, latitude, longitude, distance_meters
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Running migration for GPS & Device Lock...");

  await db.execute(sql`
    ALTER TABLE booking_windows 
    ADD COLUMN IF NOT EXISTS open_latitude VARCHAR(50),
    ADD COLUMN IF NOT EXISTS open_longitude VARCHAR(50);
  `);

  await db.execute(sql`
    ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(150),
    ADD COLUMN IF NOT EXISTS device_ip VARCHAR(100),
    ADD COLUMN IF NOT EXISTS latitude VARCHAR(50),
    ADD COLUMN IF NOT EXISTS longitude VARCHAR(50),
    ADD COLUMN IF NOT EXISTS distance_meters INTEGER;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_device_id ON bookings(device_id);
  `);

  console.log("Migration successful: GPS and device lock columns added.");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
