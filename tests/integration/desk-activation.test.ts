import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BookingService } from "../../src/server/services/booking.service";
import { StudentService } from "../../src/server/services/student.service";
import { AcademicService } from "../../src/server/services/academic.service";
import { SettingsService } from "../../src/server/services/settings.service";
import { db } from "../../src/db";
import { bookingWindows, bookings } from "../../src/db/schema";
import { eq, and, sql } from "drizzle-orm";

describe("Desk Activation, Deactivation & Automatic Ticket Migration Integration Tests", () => {
  let testGroup: any;
  let testSection: any;
  let testWindow: any;
  let studentsList: any[] = [];

  beforeAll(async () => {
    // Reset desk active settings to default (both active)
    await SettingsService.setDeskStatus("T", true);
    await SettingsService.setDeskStatus("D", true);

    const allGroups = await AcademicService.getGroups();
    testGroup = allGroups[0];
    const allSections = await AcademicService.getSectionsByGroup(testGroup.id);
    testSection = allSections[0];

    // Create 6 test students
    const promises = [1, 2, 3, 4, 5, 6].map(async (i) => {
      const rand = Math.floor(100000 + Math.random() * 900000);
      return StudentService.registerStudent({
        fullName: `طالب تجربة شبابيك ${i} علي`,
        academicNumber: `DESK_AC_${rand}`,
        nationalId: `30401010${rand}`,
        groupId: testGroup.id,
        sectionId: testSection.id,
      });
    });

    const registered = await Promise.all(promises);
    studentsList = registered.map((r) => r.student);

    // Open booking window for this section
    const [opened] = await db
      .insert(bookingWindows)
      .values({
        groupId: testGroup.id,
        sectionId: testSection.id,
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 3600000),
        capacity: 100,
        status: "OPEN",
        nextQueueNumber: 1,
      })
      .returning();
    testWindow = opened;
  });

  afterAll(async () => {
    // Restore default active settings
    await SettingsService.setDeskStatus("T", true);
    await SettingsService.setDeskStatus("D", true);
  });

  it("should have both desks active by default", async () => {
    const statuses = await SettingsService.getDeskStatuses();
    expect(statuses.deskTActive).toBe(true);
    expect(statuses.deskDActive).toBe(true);
  });

  it("should prevent deactivating both desks at the same time", async () => {
    // If T is deactivated
    await SettingsService.setDeskStatus("T", false);

    // Attempting to deactivate D while T is inactive must throw error
    const statuses = await SettingsService.getDeskStatuses();
    expect(statuses.deskTActive).toBe(false);
    expect(statuses.deskDActive).toBe(true);

    const otherDeskActive = statuses.deskTActive;
    expect(otherDeskActive).toBe(false);

    // Re-activate T
    await SettingsService.setDeskStatus("T", true);
  });

  it("when Desk D is deactivated, all active tickets on D move to T and new bookings go strictly to T", async () => {
    // Make sure both are active first
    await SettingsService.setDeskStatus("T", true);
    await SettingsService.setDeskStatus("D", true);

    // Book student 0 -> Desk T
    const b1 = await BookingService.createBooking(studentsList[0].id, testWindow.id);
    // Book student 1 -> Desk D
    const b2 = await BookingService.createBooking(studentsList[1].id, testWindow.id);

    expect(b1.desk).toBe("T");
    expect(b2.desk).toBe("D");

    // Verify student 1 is on Desk D
    const [dRecord] = await db.select().from(bookings).where(eq(bookings.id, b2.booking.id));
    expect(dRecord.desk).toBe("D");
    const originalTicketNumber = dRecord.ticketNumber || dRecord.queueNumber;

    // Now DEACTIVATE Desk D and migrate active tickets to Desk T
    await SettingsService.setDeskStatus("D", false);
    const movedCount = await BookingService.migrateDeskBookings("D", "T");
    expect(movedCount).toBeGreaterThanOrEqual(1);

    // Verify student 1 was migrated to Desk T while retaining their original ticketNumber
    const [migratedRecord] = await db.select().from(bookings).where(eq(bookings.id, b2.booking.id));
    expect(migratedRecord.desk).toBe("T");
    expect(migratedRecord.ticketNumber).toBe(originalTicketNumber);
    expect(migratedRecord.status).toBe("WAITING");
    expect(migratedRecord.notes).toContain("تم تحويل الدور تلقائياً لشباك T لإغلاق شباك D");

    // Now book student 2 and 3 while Desk D is deactivated:
    // BOTH MUST BE ASSIGNED EXCLUSIVELY TO DESK T!
    const b3 = await BookingService.createBooking(studentsList[2].id, testWindow.id);
    const b4 = await BookingService.createBooking(studentsList[3].id, testWindow.id);

    expect(b3.desk).toBe("T");
    expect(b4.desk).toBe("T");

    // All active bookings for testWindow are on Desk T
    const windowBookings = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.bookingWindowId, testWindow.id), sql`${bookings.status} = 'WAITING'`));

    expect(windowBookings.every((b) => b.desk === "T")).toBe(true);
  });

  it("when Desk T is deactivated and Desk D is active, all new bookings go strictly to D", async () => {
    // Activate D and deactivate T
    await SettingsService.setDeskStatus("D", true);
    await SettingsService.setDeskStatus("T", false);

    // Book student 4 and student 5
    const b5 = await BookingService.createBooking(studentsList[4].id, testWindow.id);
    const b6 = await BookingService.createBooking(studentsList[5].id, testWindow.id);

    // Both must be assigned exclusively to Desk D
    expect(b5.desk).toBe("D");
    expect(b6.desk).toBe("D");
  });
});
