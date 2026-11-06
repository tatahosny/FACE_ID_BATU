import { db } from "@/db";
import { delegateSlotDays, sectionFreeSlots, sections, groups, students } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { FREE_SLOT_PERIODS } from "@/lib/constants/academic";

export class FreeSlotsService {
  /**
   * Get day configurations (open/closed status)
   */
  static async getDaysSettings(academicYear = "الفرقة الثالثة") {
    return db
      .select()
      .from(delegateSlotDays)
      .where(eq(delegateSlotDays.academicYear, academicYear))
      .orderBy(asc(delegateSlotDays.dayIndex));
  }

  /**
   * Admin: Update day open/closed status
   */
  static async updateDayStatus(dayName: string, isOpen: boolean) {
    const [updated] = await db
      .update(delegateSlotDays)
      .set({ isOpen, updatedAt: new Date() })
      .where(eq(delegateSlotDays.dayName, dayName))
      .returning();
    return updated;
  }

  /**
   * Admin: Bulk toggle days (e.g. open all or close all)
   */
  static async bulkUpdateDays(days: Array<{ dayName: string; isOpen: boolean }>) {
    for (const d of days) {
      await db
        .update(delegateSlotDays)
        .set({ isOpen: d.isOpen, updatedAt: new Date() })
        .where(eq(delegateSlotDays.dayName, d.dayName));
    }
    return this.getDaysSettings();
  }

  /**
   * Get all booked free slots with section, group, and delegate details
   */
  static async getBookedSlots(academicYear = "الفرقة الثالثة", specialization?: string) {
    const conditions = [eq(sectionFreeSlots.academicYear, academicYear)];
    if (specialization && specialization !== "ALL") {
      conditions.push(eq(sectionFreeSlots.specialization, specialization));
    }

    const rows = await db
      .select({
        id: sectionFreeSlots.id,
        academicYear: sectionFreeSlots.academicYear,
        specialization: sectionFreeSlots.specialization,
        groupId: sectionFreeSlots.groupId,
        groupName: groups.name,
        sectionId: sectionFreeSlots.sectionId,
        sectionName: sections.name,
        sectionCode: sections.code,
        delegateStudentId: sectionFreeSlots.delegateStudentId,
        delegateName: sectionFreeSlots.delegateName,
        dayName: sectionFreeSlots.dayName,
        periodIndex: sectionFreeSlots.periodIndex,
        periodName: sectionFreeSlots.periodName,
        startTime: sectionFreeSlots.startTime,
        endTime: sectionFreeSlots.endTime,
        notes: sectionFreeSlots.notes,
        createdAt: sectionFreeSlots.createdAt,
      })
      .from(sectionFreeSlots)
      .innerJoin(sections, eq(sectionFreeSlots.sectionId, sections.id))
      .innerJoin(groups, eq(sectionFreeSlots.groupId, groups.id))
      .where(and(...conditions))
      .orderBy(asc(sectionFreeSlots.dayName), asc(sectionFreeSlots.periodIndex));

    return rows;
  }

  /**
   * Book or reserve a free slot for a section
   */
  static async bookSlot(data: {
    academicYear?: string;
    specialization: string;
    groupId: string;
    sectionId: string;
    delegateStudentId?: string;
    delegateName: string;
    dayName: string;
    periodIndex: number;
    notes?: string;
    isAdminOverride?: boolean;
  }) {
    const academicYear = data.academicYear || "الفرقة الثالثة";

    // 1. Check if day is open
    if (!data.isAdminOverride) {
      const [dayRecord] = await db
        .select()
        .from(delegateSlotDays)
        .where(
          and(
            eq(delegateSlotDays.dayName, data.dayName),
            eq(delegateSlotDays.academicYear, academicYear)
          )
        );

      if (!dayRecord || !dayRecord.isOpen) {
        throw new Error(
          `عذراً، يوم (${data.dayName}) مغلق حالياً من قِبل إدارة الكلية ولا يمكن حجز فترات به.`
        );
      }
    }

    // 2. Validate periodIndex (1 to 9)
    const periodDef = FREE_SLOT_PERIODS.find((p) => p.index === data.periodIndex);
    if (!periodDef) {
      throw new Error("رقم الفترة غير صالح (يجب أن يكون بين 1 و 9)");
    }

    return await db.transaction(async (tx) => {
      // 3. Check if slot is already booked for this day and period in the unified table
      const [existingSlot] = await tx
        .select({
          id: sectionFreeSlots.id,
          sectionName: sections.name,
          specialization: sectionFreeSlots.specialization,
          delegateName: sectionFreeSlots.delegateName,
        })
        .from(sectionFreeSlots)
        .innerJoin(sections, eq(sectionFreeSlots.sectionId, sections.id))
        .where(
          and(
            eq(sectionFreeSlots.academicYear, academicYear),
            eq(sectionFreeSlots.dayName, data.dayName),
            eq(sectionFreeSlots.periodIndex, data.periodIndex)
          )
        );

      if (existingSlot) {
        throw new Error(
          `هذه الفترة محجوزة بالفعل لـ (${existingSlot.sectionName} - ${existingSlot.specialization} - المندوب: ${existingSlot.delegateName}). يرجى اختيار فترة أخرى متاحة.`
        );
      }

      // 4. Verify maximum 2 periods per section
      const [{ currentSectionCount }] = await tx
        .select({ currentSectionCount: sql<number>`cast(count(*) as integer)` })
        .from(sectionFreeSlots)
        .where(eq(sectionFreeSlots.sectionId, data.sectionId));

      if (currentSectionCount >= 2 && !data.isAdminOverride) {
        throw new Error("الحد الأقصى المسموح به لكل سكشن هو فترتان فقط. لا يمكنك حجز أكثر من ذلك.");
      }

      // 5. Insert booked slot
      const [newSlot] = await tx
        .insert(sectionFreeSlots)
        .values({
          academicYear,
          specialization: data.specialization,
          groupId: data.groupId,
          sectionId: data.sectionId,
          delegateStudentId: data.delegateStudentId || null,
          delegateName: data.delegateName.trim(),
          dayName: data.dayName,
          periodIndex: data.periodIndex,
          periodName: periodDef.name,
          startTime: periodDef.startTime,
          endTime: periodDef.endTime,
          notes: data.notes || null,
        })
        .returning();

      return newSlot;
    });
  }

  /**
   * Cancel or release a booked slot
   */
  static async cancelSlot(
    slotId: string,
    options: {
      sectionId?: string;
      studentId?: string;
      isAdmin?: boolean;
    }
  ) {
    const [slot] = await db
      .select()
      .from(sectionFreeSlots)
      .where(eq(sectionFreeSlots.id, slotId));

    if (!slot) {
      throw new Error("الفترة المطلوب إلغاؤها غير موجودة");
    }

    if (!options.isAdmin) {
      if (options.sectionId && slot.sectionId !== options.sectionId) {
        throw new Error("غير مصرح: لا يمكنك إلغاء فترة محجوزة لسكشن آخر");
      }
    }

    await db.delete(sectionFreeSlots).where(eq(sectionFreeSlots.id, slotId));
    return { success: true, slotId };
  }

  /**
   * Admin: Modify / Reassign a free slot
   */
  static async adminModifySlot(
    slotId: string,
    data: {
      groupId?: string;
      sectionId?: string;
      delegateName?: string;
      dayName?: string;
      periodIndex?: number;
      notes?: string;
    }
  ) {
    let updateData: any = { updatedAt: new Date() };

    if (data.dayName) updateData.dayName = data.dayName;
    if (data.periodIndex) {
      const periodDef = FREE_SLOT_PERIODS.find((p) => p.index === data.periodIndex);
      if (periodDef) {
        updateData.periodIndex = periodDef.index;
        updateData.periodName = periodDef.name;
        updateData.startTime = periodDef.startTime;
        updateData.endTime = periodDef.endTime;
      }
    }
    if (data.groupId) updateData.groupId = data.groupId;
    if (data.sectionId) updateData.sectionId = data.sectionId;
    if (data.delegateName) updateData.delegateName = data.delegateName.trim();
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [updated] = await db
      .update(sectionFreeSlots)
      .set(updateData)
      .where(eq(sectionFreeSlots.id, slotId))
      .returning();

    return updated;
  }
}

