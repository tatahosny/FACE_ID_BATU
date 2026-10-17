import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export class SettingsService {
  private static defaultLocation = "الواحة — مبنى الشؤون (شباك بصمة الوجه)";

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
}
