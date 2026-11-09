import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export class SettingsService {
  private static defaultLocation = "مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)";

  /**
   * Retrieve a setting by its key with fallback
   */
  static async getSetting(key: string, defaultValue = ""): Promise<string> {
    try {
      const [setting] = await db
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      return setting ? setting.value : defaultValue;
    } catch (error) {
      console.error(`[SettingsService] Failed to get setting '${key}':`, error);
      return defaultValue;
    }
  }

  /**
   * Set or update a setting
   */
  static async setSetting(
    key: string,
    value: string,
    description?: string,
    updatedBy?: string
  ): Promise<void> {
    await db
      .insert(systemSettings)
      .values({
        key,
        value,
        description,
        updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value,
          description: description || undefined,
          updatedBy: updatedBy || undefined,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get the current official fingerprint activation location
   */
  static async getActivationLocation(): Promise<string> {
    return this.getSetting("activation_location", this.defaultLocation);
  }

  /**
   * Get maximum free slots allowed per section/delegate (default 2)
   */
  static async getMaxFreeSlotsPerSection(): Promise<number> {
    const val = await this.getSetting("delegate_max_free_slots", "2");
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? 2 : parsed;
  }

  /**
   * Set maximum free slots allowed per section/delegate
   */
  static async setMaxFreeSlotsPerSection(maxSlots: number, updatedBy?: string): Promise<number> {
    const sanitized = Math.max(1, Math.min(20, Math.floor(maxSlots)));
    await this.setSetting(
      "delegate_max_free_slots",
      String(sanitized),
      "الحد الأقصى لعدد فترات الفراغ التي يمكن للمندوب حجزها للسكشن",
      updatedBy
    );
    return sanitized;
  }

  /**
   * Update the fingerprint activation location (Super Admin only)
   */
  static async setActivationLocation(location: string, updatedBy?: string): Promise<string> {
    const trimmed = location.trim();
    if (!trimmed) {
      throw new Error("اسم ومقر لجنة البصمة مطلوب ولا يمكن تركه فارغاً");
    }

    await this.setSetting(
      "activation_location",
      trimmed,
      "المقر المعتمد لتسجيل بصمة الوجه المرسل في إشعار التيليجرام للطلاب",
      updatedBy
    );

    return trimmed;
  }

  /**
   * Get assigned staff for Desk T and Desk D
   */
  static async getDeskStaff() {
    const deskTStaffId = await this.getSetting("desk_t_staff_id", "");
    const deskDStaffId = await this.getSetting("desk_d_staff_id", "");
    return {
      deskT: deskTStaffId,
      deskD: deskDStaffId,
    };
  }

  /**
   * Set assigned staff for a desk (T or D)
   */
  static async setDeskStaff(desk: "T" | "D", staffId: string, updatedBy?: string) {
    const key = desk === "T" ? "desk_t_staff_id" : "desk_d_staff_id";
    const desc = desk === "T" ? "الموظف المسؤول عن شباك T" : "الموظف المسؤول عن شباك D";
    await this.setSetting(key, staffId, desc, updatedBy);
    return { desk, staffId };
  }

  /**
   * Get active status for Desk T and Desk D
   */
  static async getDeskStatuses(): Promise<{ deskTActive: boolean; deskDActive: boolean }> {
    const deskTActiveStr = await this.getSetting("desk_t_active", "true");
    const deskDActiveStr = await this.getSetting("desk_d_active", "true");
    return {
      deskTActive: deskTActiveStr !== "false",
      deskDActive: deskDActiveStr !== "false",
    };
  }

  /**
   * Set active status for a desk (T or D)
   */
  static async setDeskStatus(desk: "T" | "D", isActive: boolean, updatedBy?: string) {
    const key = desk === "T" ? "desk_t_active" : "desk_d_active";
    const desc = desk === "T" ? "حالة تفعيل شباك T" : "حالة تفعيل شباك D";
    await this.setSetting(key, isActive ? "true" : "false", desc, updatedBy);
    return { desk, isActive };
  }

  /**
   * Get delegate portal open status and expiration
   */
  static async getDelegatePortalStatus(): Promise<{
    isOpen: boolean;
    openUntil: string | null;
    remainingMinutes: number;
  }> {
    const val = await this.getSetting("delegate_portal_open_until", "");
    if (!val || !val.trim()) {
      return { isOpen: false, openUntil: null, remainingMinutes: 0 };
    }

    try {
      const untilDate = new Date(val);
      const now = new Date();
      if (isNaN(untilDate.getTime())) {
        return { isOpen: false, openUntil: null, remainingMinutes: 0 };
      }

      if (now.getTime() < untilDate.getTime()) {
        const remainingMinutes = Math.max(
          1,
          Math.ceil((untilDate.getTime() - now.getTime()) / (60 * 1000))
        );
        return {
          isOpen: true,
          openUntil: untilDate.toISOString(),
          remainingMinutes,
        };
      } else {
        return { isOpen: false, openUntil: null, remainingMinutes: 0 };
      }
    } catch {
      return { isOpen: false, openUntil: null, remainingMinutes: 0 };
    }
  }

  /**
   * Set delegate portal duration (in minutes).
   * Passing <= 0 closes the portal immediately.
   */
  static async setDelegatePortalDuration(
    durationMinutes: number,
    updatedBy?: string
  ): Promise<{
    isOpen: boolean;
    openUntil: string | null;
    remainingMinutes: number;
  }> {
    if (durationMinutes <= 0) {
      await this.setSetting(
        "delegate_portal_open_until",
        "",
        "بوابة تسجيل فترات المناديب مغلقة",
        updatedBy
      );
      return { isOpen: false, openUntil: null, remainingMinutes: 0 };
    }

    const untilDate = new Date(Date.now() + durationMinutes * 60 * 1000);
    await this.setSetting(
      "delegate_portal_open_until",
      untilDate.toISOString(),
      `موعد إغلاق بوابة المناديب تلقائياً بعد ${durationMinutes} دقيقة`,
      updatedBy
    );

    return {
      isOpen: true,
      openUntil: untilDate.toISOString(),
      remainingMinutes: durationMinutes,
    };
  }
}

