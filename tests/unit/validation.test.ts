import { describe, it, expect } from "vitest";
import { isValidEgyptianNationalId, studentRegistrationSchema } from "../../src/lib/validation/student";
import { createBookingSchema, createBookingWindowSchema } from "../../src/lib/validation/booking";

describe("Input Validation & Zod Schemas", () => {
  it("should validate valid Egyptian National IDs", () => {
    // Century 3 (2000s), Month 01, Day 01, Gov 02 (Alexandria)
    expect(isValidEgyptianNationalId("30301010200123")).toBe(true);
    // Century 2 (1900s), Month 12, Day 25, Gov 01 (Cairo)
    expect(isValidEgyptianNationalId("29912250100456")).toBe(true);
  });

  it("should reject invalid Egyptian National IDs", () => {
    expect(isValidEgyptianNationalId("123")).toBe(false); // Too short
    expect(isValidEgyptianNationalId("40301010200123")).toBe(false); // Invalid century 4
    expect(isValidEgyptianNationalId("30315010200123")).toBe(false); // Invalid month 15
    expect(isValidEgyptianNationalId("30301350200123")).toBe(false); // Invalid day 35
    expect(isValidEgyptianNationalId("30301019900123")).toBe(false); // Invalid gov code 99
    expect(isValidEgyptianNationalId("abcdefghijklmn")).toBe(false); // Non-digit
  });

  it("should validate full student registration schema", () => {
    const valid = {
      fullName: "أحمد محمد علي إبراهيم",
      academicNumber: "20230154",
      nationalId: "30301010200123",
      groupId: "00000000-0000-0000-0000-000000000001",
      sectionId: "00000000-0000-0000-0000-000000000002",
    };

    const parsed = studentRegistrationSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("should reject student registration with two-name only or invalid characters", () => {
    const invalid = {
      fullName: "أحمد محمد", // Less than 3 words
      academicNumber: "20230154",
      nationalId: "30301010200123",
      groupId: "00000000-0000-0000-0000-000000000001",
      sectionId: "00000000-0000-0000-0000-000000000002",
    };

    const parsed = studentRegistrationSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("should validate booking window creation schema", () => {
    const validWindow = {
      groupId: "00000000-0000-0000-0000-000000000001",
      sectionId: "00000000-0000-0000-0000-000000000002",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      capacity: 50,
      status: "OPEN" as const,
    };

    const parsed = createBookingWindowSchema.safeParse(validWindow);
    expect(parsed.success).toBe(true);
  });
});
