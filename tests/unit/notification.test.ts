import { describe, it, expect } from "vitest";
import { NotificationService } from "../../src/server/services/notification.service";

describe("Notification Formatting & Message Content Tests", () => {
  it("should format PROXIMITY_10 message correctly with remaining ahead", () => {
    const text = NotificationService.formatNotificationMessage("PROXIMITY_10", {
      studentName: "محمود حسن",
      remainingAhead: 10,
      desk: "T",
    });

    expect(text).toContain("محمود حسن");
    expect(text).toContain("10");
    expect(text).toContain("شباك T");
    expect(text).toContain("باقى على دورك 10 اشخاص");
  });

  it("should format PROXIMITY_5 message correctly", () => {
    const text = NotificationService.formatNotificationMessage("PROXIMITY_5", {
      studentName: "محمود حسن",
      remainingAhead: 5,
      desk: "D",
    });

    expect(text).toContain("محمود حسن");
    expect(text).toContain("5");
    expect(text).toContain("شباك D");
    expect(text).toContain("متبقي 5 أدوار فقط");
  });

  it("should format PROXIMITY_NEXT message correctly", () => {
    const text = NotificationService.formatNotificationMessage("PROXIMITY_NEXT", {
      studentName: "سارة علي",
      remainingAhead: 1,
      desk: "T",
    });

    expect(text).toContain("شباك T");
    expect(text).toContain("أنت التالي مباشرة");
  });

  it("should format TURN_CALLED message correctly", () => {
    const text = NotificationService.formatNotificationMessage("TURN_CALLED", {
      studentName: "علي عمر",
      queueNumber: "#005",
      desk: "T",
    });

    expect(text).toContain("علي عمر");
    expect(text).toContain("#005");
    expect(text).toContain("حان دورك الآن!");
  });
});
