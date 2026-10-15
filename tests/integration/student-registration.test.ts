import { describe, it, expect, beforeAll } from "vitest";
import { StudentService } from "../../src/server/services/student.service";
import { AcademicService } from "../../src/server/services/academic.service";
import { db } from "../../src/db";
import { students, groups, sections } from "../../src/db/schema";
import { eq } from "drizzle-orm";

describe("Student Registration & Data Protection Integration Tests", () => {
  let testGroup: any;
  let testSection: any;
  let otherGroup: any;
  let otherSection: any;

  beforeAll(async () => {
    const allGroups = await AcademicService.getGroups();
    testGroup = allGroups[0];
    otherGroup = allGroups[1] || allGroups[0];

    const sectionsOfTestGroup = await AcademicService.getSectionsByGroup(testGroup.id);
    testSection = sectionsOfTestGroup[0];

    const sectionsOfOtherGroup = await AcademicService.getSectionsByGroup(otherGroup.id);
    otherSection = sectionsOfOtherGroup[0];
  });

  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const testAcademicNumber = `TEST_${randSuffix}`;
  const testNationalId = `3030101020${randSuffix}`;

  it("should successfully register a valid student with encrypted National ID", async () => {
    const result = await StudentService.registerStudent({
      fullName: "محمد إبراهيم حسن أحمد",
      academicNumber: testAcademicNumber,
      nationalId: testNationalId,
      groupId: testGroup.id,
      sectionId: testSection.id,
    });

    expect(result.student).toBeDefined();
    expect(result.student.academicNumber).toBe(testAcademicNumber);
    expect(result.telegramLinkToken).toBeDefined();
    expect(result.telegramDeepLink).toContain("https://t.me/");

    // Verify database record has encrypted national ID and not plaintext
    const [dbRecord] = await db
      .select()
      .from(students)
      .where(eq(students.id, result.student.id));

    expect(dbRecord.nationalIdEncrypted).not.toBe(testNationalId);
    expect(dbRecord.nationalIdEncrypted).toContain(":"); // iv:authTag:cipher
    expect(dbRecord.nationalIdHash).toHaveLength(64);
  });

  it("should reject registration with duplicate academic number in different group/section with custom Arabic message", async () => {
    await expect(
      StudentService.registerStudent({
        fullName: "طالب يحاول تغيير مجموعته",
        academicNumber: testAcademicNumber,
        nationalId: "30301010209999", // Different national ID
        groupId: otherGroup.id,
        sectionId: otherSection.id, // Belongs to otherGroup
      })
    ).rejects.toThrow("البيانات مسجلة بالفعل، يرجى مراجعة إدارة الكلية لتعديل القيد الأكاديمي.");
  });

  it("should reject registration with duplicate National ID", async () => {
    await expect(
      StudentService.registerStudent({
        fullName: "طالب آخر بنفس الرقم القومي",
        academicNumber: `DIFF_${randSuffix}`,
        nationalId: testNationalId, // Same National ID
        groupId: testGroup.id,
        sectionId: testSection.id,
      })
    ).rejects.toThrow("الرقم القومي مسجل بالفعل لطالب آخر.");
  });

  it("should reject registration if section does not belong to group", async () => {
    // Pass testSection with otherGroup
    await expect(
      StudentService.registerStudent({
        fullName: "طالب بسكشن غير صحيح",
        academicNumber: `FAKE_${randSuffix}`,
        nationalId: "30301010208888",
        groupId: otherGroup.id,
        sectionId: testSection.id, // Doesn't belong to otherGroup
      })
    ).rejects.toThrow("السكشن المختار لا ينتمي إلى المجموعة المحددة أو غير متاح");
  });
});
