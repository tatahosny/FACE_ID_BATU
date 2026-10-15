import { db } from "../src/db";
import {
  students,
  bookings,
  fingerprintActivations,
  telegramLinkTokens,
  notificationOutbox,
  bookingWindows,
} from "../src/db/schema";
import { ne, eq, inArray } from "drizzle-orm";

async function cleanup() {
  console.log("🧹 Starting database cleanup: Removing all test/dummy students...");

  // 1. Find all students except Mostafa Mohamed Hosny (academicNumber 2421204)
  const dummyStudents = await db
    .select({ id: students.id, name: students.fullName, academicNumber: students.academicNumber })
    .from(students)
    .where(ne(students.academicNumber, "2421204"));

  console.log(`Found ${dummyStudents.length} dummy students to remove.`);

  if (dummyStudents.length > 0) {
    const dummyIds = dummyStudents.map((s) => s.id);

    // 2. Delete fingerprint activations for dummy students
    const deletedActivations = await db
      .delete(fingerprintActivations)
      .where(inArray(fingerprintActivations.studentId, dummyIds))
      .returning();
    console.log(`Deleted ${deletedActivations.length} dummy fingerprint activations.`);

    // 3. Delete bookings for dummy students
    const deletedBookings = await db
      .delete(bookings)
      .where(inArray(bookings.studentId, dummyIds))
      .returning();
    console.log(`Deleted ${deletedBookings.length} dummy bookings.`);

    // 4. Delete telegram link tokens for dummy students
    const deletedTokens = await db
      .delete(telegramLinkTokens)
      .where(inArray(telegramLinkTokens.studentId, dummyIds))
      .returning();
    console.log(`Deleted ${deletedTokens.length} dummy telegram link tokens.`);

    // 5. Delete notification outbox records for dummy students
    const deletedOutbox = await db
      .delete(notificationOutbox)
      .where(inArray(notificationOutbox.recipientId, dummyIds))
      .returning();
    console.log(`Deleted ${deletedOutbox.length} dummy notification outbox records.`);

    // 6. Delete the dummy students
    const deletedStudents = await db
      .delete(students)
      .where(inArray(students.id, dummyIds))
      .returning();
    console.log(`Deleted ${deletedStudents.length} dummy students.`);
  }

  // 7. Verify remaining students
  const remaining = await db.select().from(students);
  console.log("✅ Remaining students in database:", remaining.map((s) => ({
    name: s.fullName,
    academicNumber: s.academicNumber,
    telegramUserId: s.telegramUserId,
    telegramUsername: s.telegramUsername,
  })));

  // 8. Make sure Mostafa has an active booking to test
  if (remaining.length > 0) {
    const mostafa = remaining[0];
    const mostafaBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.studentId, mostafa.id));

    console.log(`Mostafa has ${mostafaBookings.length} active bookings:`, mostafaBookings);
  }

  console.log("🎉 Database cleanup complete!");
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup error:", err);
    process.exit(1);
  });
