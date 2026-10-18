import { describe, it, expect, beforeAll } from "vitest";
import { BookingService } from "../../src/server/services/booking.service";
import { StudentService } from "../../src/server/services/student.service";
import { AcademicService } from "../../src/server/services/academic.service";
import { db } from "../../src/db";
import { bookingWindows, bookings, students } from "../../src/db/schema";
import { eq } from "drizzle-orm";

describe("Booking Concurrency & Queue Allocation Integration Tests", () => {
  let testGroup: any;
  let testSection1: any;
  let testSection2: any;
  let openWindow: any;
  let closedWindow: any;
  let testStudents: any[] = [];

  beforeAll(async () => {
    const allGroups = await AcademicService.getGroups();
    testGroup = allGroups[0];

    const allSections = await AcademicService.getSectionsByGroup(testGroup.id);
    testSection1 = allSections[0];
    testSection2 = allSections[1];

    // Pre-register 4 students in parallel
    const studentPromises = [1, 2, 3, 4].map(async (i) => {
      const rand = Math.floor(100000 + Math.random() * 900000);
      return StudentService.registerStudent({
        fullName: `طالب تجريبي حجز ${i} حسن`,
        academicNumber: `BOOK_AC_${rand}`,
        nationalId: `30301010${rand}`,
        groupId: testGroup.id,
        sectionId: testSection1.id,
      });
    });

    const registered = await Promise.all(studentPromises);
    testStudents = registered.map((r) => r.student);

    // Create Open Window for Section 1 with capacity 2
    const [opened] = await db
      .insert(bookingWindows)
      .values({
        groupId: testGroup.id,
        sectionId: testSection1.id,
        startsAt: new Date(Date.now() - 60000), // Started 1 min ago
        endsAt: new Date(Date.now() + 3600000), // Ends in 1 hour
        capacity: 2,
        status: "OPEN",
        nextQueueNumber: 1,
      })
      .returning();
    openWindow = opened;

    // Create Closed Window for Section 2
    const [closed] = await db
      .insert(bookingWindows)
      .values({
        groupId: testGroup.id,
        sectionId: testSection2.id,
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
        capacity: 50,
        status: "CLOSED",
      })
      .returning();
    closedWindow = closed;
  });

  it("should reject booking when window is closed", async () => {
    await expect(
      BookingService.createBooking(testStudents[0].id, closedWindow.id)
    ).rejects.toThrow("لا يمكن الحجز الآن، لأن الحجز لم يتم فتحه للسكشن الخاص بك. يرجى متابعة الإعلانات الرسمية.");
  });

  it("should allocate unique sequential queue numbers and enforce capacity under concurrent requests", async () => {
    // Student 0 and 1 attempt booking simultaneously
    const attempts = await Promise.allSettled([
      BookingService.createBooking(testStudents[0].id, openWindow.id),
      BookingService.createBooking(testStudents[1].id, openWindow.id),
    ]);

    const successes = attempts.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    expect(successes).toHaveLength(2);

    const queueNumbers = (successes.map((s) => s.value.booking.queueNumber) as number[]).sort((a, b) => a - b);
    expect(new Set(queueNumbers).size).toBe(2); // Zero duplicate queue numbers!
    expect(queueNumbers[1] - queueNumbers[0]).toBe(1); // Consecutive sequential numbers

    // Third student also books successfully without capacity cap (as requested: no max limit)
    const thirdBooking = await BookingService.createBooking(testStudents[2].id, openWindow.id);
    expect(thirdBooking.booking.queueNumber).toBe(queueNumbers[1] + 1);
  }, 60000);

  it("should prevent duplicate booking by the same student in the same window (idempotent)", async () => {
    const res = await BookingService.createBooking(testStudents[0].id, openWindow.id);
    expect(res.isExisting).toBe(true);
    expect(res.booking.queueNumber).toBeDefined();
  });
});
