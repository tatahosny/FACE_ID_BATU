import { describe, it, expect, beforeAll, vi } from "vitest";
import { TelegramService } from "../../src/server/services/telegram.service";
import { StudentService } from "../../src/server/services/student.service";
import { AcademicService } from "../../src/server/services/academic.service";
import { db } from "../../src/db";
import { students, telegramLinkTokens } from "../../src/db/schema";
import { eq } from "drizzle-orm";

describe("Telegram Account Linking & Webhook Idempotency Integration Tests", () => {
  let testStudent: any;

  beforeAll(async () => {
    // Mock Telegram outbound messages in automated tests
    vi.spyOn(TelegramService, "sendMessage").mockResolvedValue({ ok: true, result: { message_id: 123 } });

    const allGroups = await AcademicService.getGroups();
    const allSections = await AcademicService.getSectionsByGroup(allGroups[0].id);

    const rand = Math.floor(100000 + Math.random() * 900000);
    const reg = await StudentService.registerStudent({
      fullName: "طالب تجربة ربط التيليجرام",
      academicNumber: `TG_AC_${rand}`,
      nationalId: `30301010${rand}`,
      groupId: allGroups[0].id,
      sectionId: allSections[0].id,
    });
    testStudent = reg.student;
  });

  it("should create a secure single-use linking token with 15-minute expiration", async () => {
    const link = await TelegramService.createLinkingToken(testStudent.id);
    expect(link.token).toHaveLength(64);
    expect(link.deepLink).toContain(`start=${link.token}`);
    expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("should atomically link Telegram account via webhook update and mark token as used", async () => {
    const link = await TelegramService.createLinkingToken(testStudent.id);
    const mockChatId = Math.floor(100000000 + Math.random() * 900000000);
    const mockUpdateId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);

    // Mock incoming Telegram webhook update
    const mockUpdate = {
      update_id: mockUpdateId,
      message: {
        message_id: 1,
        from: {
          id: mockChatId,
          is_bot: false,
          first_name: "Test",
          username: "test_student_tg",
        },
        chat: { id: mockChatId, type: "private" },
        text: `/start ${link.token}`,
      },
    };

    const webhookResult = await TelegramService.handleWebhookUpdate(mockUpdate);
    expect(webhookResult.handled).toBe(true);
    expect(webhookResult.success).toBe(true);

    // Verify student record updated in DB
    const [updated] = await db
      .select()
      .from(students)
      .where(eq(students.id, testStudent.id));

    expect(updated.telegramUserId).toBe(mockChatId);
    expect(updated.telegramLinkedAt).toBeDefined();

    // Reusing the same token should fail
    const reuseUpdate = {
      update_id: mockUpdateId + 1,
      message: {
        ...mockUpdate.message,
        text: `/start ${link.token}`,
      },
    };

    const reuseResult = await TelegramService.handleWebhookUpdate(reuseUpdate);
    expect(reuseResult.success).toBe(false);
  });

  it("should ignore duplicate webhook update_id (idempotency guarantee)", async () => {
    const duplicateUpdateId = 88889999 + Math.floor(Math.random() * 100000);
    const update = {
      update_id: duplicateUpdateId,
      message: {
        message_id: 2,
        from: { id: 123456 },
        text: "/start",
      },
    };

    const first = await TelegramService.handleWebhookUpdate(update);
    expect(first.duplicate).toBeUndefined();

    const second = await TelegramService.handleWebhookUpdate(update);
    expect(second.duplicate).toBe(true);
  });
});
