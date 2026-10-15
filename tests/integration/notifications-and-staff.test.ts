import { describe, it, expect, beforeAll, vi } from "vitest";
import { StaffService } from "../../src/server/services/staff.service";
import { NotificationService } from "../../src/server/services/notification.service";
import { CampaignService } from "../../src/server/services/campaign.service";
import { StudentService } from "../../src/server/services/student.service";
import { AcademicService } from "../../src/server/services/academic.service";
import { TelegramService } from "../../src/server/services/telegram.service";
import { db } from "../../src/db";
import { users, notificationOutbox, telegramCampaigns } from "../../src/db/schema";
import { eq } from "drizzle-orm";

describe("Staff Operations, Outbox Notifications & Telegram Campaigns Integration Tests", () => {
  let staffUser: any;
  let testStudent: any;

  beforeAll(async () => {
    vi.spyOn(TelegramService, "sendMessage").mockResolvedValue({ ok: true, result: { message_id: 456 } });

    // 1. Get or create staff user
    const [existingStaff] = await db
      .select()
      .from(users)
      .where(eq(users.role, "SUPER_ADMIN"));

    staffUser = existingStaff;

    // 2. Register a student with mock linked Telegram
    const groups = await AcademicService.getGroups();
    const sections = await AcademicService.getSectionsByGroup(groups[0].id);

    const rand = Math.floor(100000 + Math.random() * 900000);
    const reg = await StudentService.registerStudent({
      fullName: "طالب تجربة البصمة والإشعارات",
      academicNumber: `STAFF_AC_${rand}`,
      nationalId: `30301010${rand}`,
      groupId: groups[0].id,
      sectionId: sections[0].id,
    });
    testStudent = reg.student;
  });

  it("should record fingerprint activation with authenticated staff identity", async () => {
    const activation = await StaffService.recordActivation({
      studentId: testStudent.id,
      staffUserId: staffUser.id,
      notes: "تم فحص الهوية والتقاط بصمة الوجه بنجاح",
    });

    expect(activation.activation).toBeDefined();
    expect(activation.activation.status).toBe("ACTIVATED");
    expect(activation.activation.activatedBy).toBe(staffUser.id);
  });

  it("should format notification messages properly without exposing sensitive National ID", () => {
    const message = NotificationService.formatNotificationMessage("ACTIVATION_SUCCESS", {
      studentName: "أحمد علي",
      academicNumber: "20230154",
      staffName: "د. هاني إبراهيم",
      activatedAt: "15 أكتوبر 2026",
    });

    expect(message).toContain("أحمد علي");
    expect(message).toContain("20230154");
    expect(message).toContain("د. هاني إبراهيم");
    expect(message).not.toContain("30301"); // NEVER National ID!
  });

  it("should enforce deduplication in outbox with unique idempotency key", async () => {
    const key = `test_idempotency_${Date.now()}`;

    const first = await NotificationService.queueOutboxItem({
      eventType: "PROXIMITY_10",
      recipientId: testStudent.id,
      telegramChatId: 123456789,
      payload: { studentName: testStudent.fullName },
      idempotencyKey: key,
    });
    expect(first).toBe(true);

    // Duplicate attempt with same idempotency key
    const second = await NotificationService.queueOutboxItem({
      eventType: "PROXIMITY_10",
      recipientId: testStudent.id,
      telegramChatId: 123456789,
      payload: { studentName: testStudent.fullName },
      idempotencyKey: key,
    });
    expect(second).toBe(false); // Duplicate ignored!
  });

  it("should create Telegram bulk campaign with target audience segmentation", async () => {
    const campaign = await CampaignService.createCampaign({
      title: "إعلان تجريبي رسمي",
      message: "يرجى العلم بفتح باب حجز بصمة الوجه للسكشن الخاص بكم.",
      targetType: "ALL",
      createdBy: staffUser.id,
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.status).toBe("QUEUED");
  });
});
