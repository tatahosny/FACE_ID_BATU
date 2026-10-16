import { db } from "@/db";
import { groups, sections, sectionSchedules } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

export class AcademicService {
  static async getGroups(activeOnly = true) {
    if (activeOnly) {
      return db.select().from(groups).where(eq(groups.isActive, true)).orderBy(asc(groups.name));
    }
    return db.select().from(groups).orderBy(asc(groups.name));
  }

  static async getGroupById(groupId: string) {
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
    return group || null;
  }

  static async getSectionsByGroup(groupId: string, activeOnly = true) {
    if (activeOnly) {
      return db
        .select()
        .from(sections)
        .where(and(eq(sections.groupId, groupId), eq(sections.isActive, true)))
        .orderBy(asc(sections.code));
    }
    return db
      .select()
      .from(sections)
      .where(eq(sections.groupId, groupId))
      .orderBy(asc(sections.code));
  }

  static async getAllSections(activeOnly = true) {
    if (activeOnly) {
      return db.select().from(sections).where(eq(sections.isActive, true)).orderBy(asc(sections.code));
    }
    return db.select().from(sections).orderBy(asc(sections.code));
  }

  static async getSectionById(sectionId: string) {
    const [section] = await db.select().from(sections).where(eq(sections.id, sectionId));
    return section || null;
  }

  static async createGroup(name: string, code: string) {
    const [created] = await db.insert(groups).values({ name, code }).returning();
    return created;
  }

  static async updateGroup(id: string, data: { name?: string; isActive?: boolean }) {
    const [updated] = await db
      .update(groups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(groups.id, id))
      .returning();
    return updated;
  }

  static async createSection(groupId: string, name: string, code: string) {
    const [created] = await db.insert(sections).values({ groupId, name, code }).returning();
    return created;
  }

  static async updateSection(id: string, data: { name?: string; isActive?: boolean }) {
    const [updated] = await db
      .update(sections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sections.id, id))
      .returning();
    return updated;
  }

  static async getSectionSchedules(sectionId: string) {
    return db.select().from(sectionSchedules).where(eq(sectionSchedules.sectionId, sectionId));
  }

  static async createSectionSchedule(data: {
    sectionId: string;
    date: string;
    startTime: string;
    endTime: string;
    subSection?: "ALL" | "A" | "B";
    notes?: string;
  }) {
    const [created] = await db
      .insert(sectionSchedules)
      .values({
        ...data,
        subSection: data.subSection || "ALL",
      })
      .returning();
    return created;
  }
}
