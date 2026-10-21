import { db } from "../src/db";
import {
  students,
  bookings,
  fingerprintActivations,
  telegramLinkTokens,
  notificationOutbox,
  bookingWindows,
  feedbackRatings,
} from "../src/db/schema";
import { inArray, sql } from "drizzle-orm";

async function cleanupTestStudents() {
  console.log("🧹 ========================================================");
  console.log("🧹 DATABASE CLEANUP: REMOVING TEST DATA & PRESERVING REAL STUDENTS");
  console.log("🧹 ========================================================\n");

  // 1. Fetch all students
  const allStudents = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      academicNumber: students.academicNumber,
      telegramUsername: students.telegramUsername,
      telegramUserId: students.telegramUserId,
    })
    .from(students);

  console.log(`📊 Total students currently in database: ${allStudents.length}`);

  // Test students filter criteria:
  // - Name contains 'تجريب' or 'تجربة' or 'test'
  // - Academic number starts with BOOK_AC_, DESK_AC_, STAFF_AC_, TG_AC_, TEST_, DEMO_
  const isTestStudent = (s: typeof allStudents[0]) => {
    const nameLower = (s.fullName || "").toLowerCase();
    const ac = (s.academicNumber || "").trim().toUpperCase();

    return (
      nameLower.includes("تجريب") ||
      nameLower.includes("تجربة") ||
      nameLower.includes("test") ||
      ac.startsWith("BOOK_AC_") ||
      ac.startsWith("DESK_AC_") ||
      ac.startsWith("STAFF_AC_") ||
      ac.startsWith("TG_AC_") ||
      ac.startsWith("TEST_") ||
      ac.startsWith("DEMO_")
    );
  };

  const testStudentsList = allStudents.filter(isTestStudent);
  const realStudentsList = allStudents.filter((s) => !isTestStudent(s));

  console.log(`❌ Test students identified: ${testStudentsList.length}`);
  console.log(`✅ Real students to be preserved: ${realStudentsList.length}\n`);

  if (testStudentsList.length === 0) {
    console.log("✨ No test students found in the database. Nothing to clean.");
    return;
  }

  const testStudentIds = testStudentsList.map((s) => s.id);

  console.log("📋 Test students to be deleted:");
  testStudentsList.forEach((s, idx) => {
    console.log(`  ${idx + 1}. [${s.academicNumber}] ${s.fullName}`);
  });

  // Execute cleanup inside an atomic database transaction
  await db.transaction(async (tx) => {
    // A0. Delete feedback ratings for test students
    await tx
      .delete(feedbackRatings)
      .where(inArray(feedbackRatings.studentId, testStudentIds));

    // A. Delete fingerprint activations for test students
    const deletedActivations = await tx
      .delete(fingerprintActivations)
      .where(inArray(fingerprintActivations.studentId, testStudentIds))
      .returning({ id: fingerprintActivations.id });
    console.log(`\n🗑️  Deleted ${deletedActivations.length} test fingerprint activations.`);

    // B. Delete bookings for test students
    const deletedBookings = await tx
      .delete(bookings)
      .where(inArray(bookings.studentId, testStudentIds))
      .returning({ id: bookings.id, queueNumber: bookings.queueNumber });
    console.log(`🗑️  Deleted ${deletedBookings.length} test bookings.`);

    // C. Delete telegram link tokens for test students
    const deletedTokens = await tx
      .delete(telegramLinkTokens)
      .where(inArray(telegramLinkTokens.studentId, testStudentIds))
      .returning({ id: telegramLinkTokens.id });
    console.log(`🗑️  Deleted ${deletedTokens.length} test telegram link tokens.`);

    // D. Delete notification outbox records for test students
    const deletedOutbox = await tx
      .delete(notificationOutbox)
      .where(inArray(notificationOutbox.recipientId, testStudentIds))
      .returning({ id: notificationOutbox.id });
    console.log(`🗑️  Deleted ${deletedOutbox.length} test notification outbox records.`);

    // E. Finally, delete the test students themselves
    const deletedStudents = await tx
      .delete(students)
      .where(inArray(students.id, testStudentIds))
      .returning({ id: students.id, academicNumber: students.academicNumber });
    console.log(`🗑️  Deleted ${deletedStudents.length} test students from the students table.`);

    // F. Resynchronize nextQueueNumber across all booking windows based on remaining real bookings
    const [maxRealBooking] = await tx
      .select({ maxQ: sql<number>`COALESCE(MAX(${bookings.queueNumber}), 0)` })
      .from(bookings);

    const currentMaxRealQueue = Number(maxRealBooking?.maxQ || 0);
    const synchronizedNext = currentMaxRealQueue + 1;

    await tx
      .update(bookingWindows)
      .set({
        nextQueueNumber: synchronizedNext,
        updatedAt: new Date(),
      });
    console.log(`🔄 Synchronized all booking windows nextQueueNumber to: ${synchronizedNext}`);
  });

  // Verify remaining real data
  const remainingStudents = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      academicNumber: students.academicNumber,
    })
    .from(students);

  const remainingBookings = await db
    .select({
      id: bookings.id,
      queueNumber: bookings.queueNumber,
      ticketNumber: bookings.ticketNumber,
      desk: bookings.desk,
      status: bookings.status,
      studentId: bookings.studentId,
    })
    .from(bookings);

  console.log("\n========================================================");
  console.log(`🎉 CLEANUP SUCCESSFUL!`);
  console.log(`✅ Preserved Real Students: ${remainingStudents.length}`);
  console.log(`✅ Preserved Real Bookings: ${remainingBookings.length}`);
  console.log("========================================================\n");
}

cleanupTestStudents()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  });
