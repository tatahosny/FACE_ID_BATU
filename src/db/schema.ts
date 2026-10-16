import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  date,
  time,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Academic Groups (e.g. Group 1, Group 2, Group 3)
export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 2. Academic Sections (4 sections per group, 12 in total)
export const sections = pgTable(
  "sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    groupIdx: index("sections_group_id_idx").on(table.groupId),
  })
);

// 3. Application Users (Super Admin, Staff, Student login)
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 20 }).default("STUDENT").notNull(), // 'SUPER_ADMIN' | 'STAFF' | 'STUDENT'
  fullName: varchar("full_name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  bannedUntil: timestamp("banned_until", { withTimezone: true }),
  banReason: text("ban_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 4. Students Records (Registered students of Borg El Arab Technological University)
export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    academicNumber: varchar("academic_number", { length: 50 }).notNull().unique(),
    nationalIdEncrypted: text("national_id_encrypted").notNull(), // AES-256-GCM authenticated encryption
    nationalIdHash: varchar("national_id_hash", { length: 64 }).notNull().unique(), // Keyed HMAC-SHA256 for zero-knowledge uniqueness & lookup
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "restrict" }),
    subSection: varchar("sub_section", { length: 10 }).default("A").notNull(), // 'A' | 'B'
    telegramUserId: bigint("telegram_user_id", { mode: "number" }).unique(),
    telegramUsername: varchar("telegram_username", { length: 100 }),
    telegramLinkedAt: timestamp("telegram_linked_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    bannedUntil: timestamp("banned_until", { withTimezone: true }),
    banReason: text("ban_reason"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    academicNumberIdx: index("students_academic_number_idx").on(table.academicNumber),
    nationalIdHashIdx: index("students_national_id_hash_idx").on(table.nationalIdHash),
    groupSectionIdx: index("students_group_section_idx").on(table.groupId, table.sectionId),
    telegramUserIdx: index("students_telegram_user_idx").on(table.telegramUserId),
  })
);

// 5. Section Schedules (Official schedules for sections)
export const sectionSchedules = pgTable(
  "section_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    subSection: varchar("sub_section", { length: 10 }).default("ALL").notNull(), // 'ALL' | 'A' | 'B'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sectionDateIdx: index("section_schedules_section_date_idx").on(table.sectionId, table.date),
  })
);

// 6. Booking Windows (Configured by Super Admin for sections)
export const bookingWindows = pgTable(
  "booking_windows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 20 }).default("DRAFT").notNull(), // 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED'
    capacity: integer("capacity").default(50).notNull(),
    subSection: varchar("sub_section", { length: 10 }).default("ALL").notNull(), // 'ALL' | 'A' | 'B'
    nextQueueNumber: integer("next_queue_number").default(1).notNull(), // Concurrency safe atomic counter
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sectionStatusIdx: index("booking_windows_section_status_idx").on(table.sectionId, table.status),
    startsEndsIdx: index("booking_windows_starts_ends_idx").on(table.startsAt, table.endsAt),
  })
);

// 7. Bookings (Queue reservations)
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingWindowId: uuid("booking_window_id")
      .notNull()
      .references(() => bookingWindows.id, { onDelete: "restrict" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    queueNumber: integer("queue_number").notNull(),
    status: varchar("status", { length: 20 }).default("WAITING").notNull(), // 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
    bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow().notNull(),
    calledAt: timestamp("called_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Concurrency guarantee: Unique queue number per window
    windowQueueIdx: uniqueIndex("bookings_window_queue_idx").on(table.bookingWindowId, table.queueNumber),
    studentWindowIdx: index("bookings_student_window_idx").on(table.studentId, table.bookingWindowId),
    statusIdx: index("bookings_status_idx").on(table.status),
    windowStatusIdx: index("bookings_window_status_idx").on(table.bookingWindowId, table.status),
  })
);

// 8. Fingerprint Activations (Recorded by authenticated Staff)
export const fingerprintActivations = pgTable(
  "fingerprint_activations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    activatedBy: uuid("activated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).default("ACTIVATED").notNull(), // 'ACTIVATED' | 'FAILED'
    notes: text("notes"),
    activatedAt: timestamp("activated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    studentIdx: index("fingerprint_activations_student_idx").on(table.studentId),
    bookingIdx: index("fingerprint_activations_booking_idx").on(table.bookingId),
    staffIdx: index("fingerprint_activations_staff_idx").on(table.activatedBy),
  })
);

// 9. Telegram Link Tokens (Single-use, cryptographically secure linking tokens)
export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(), // SHA-256 of token
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenHashIdx: index("telegram_link_tokens_hash_idx").on(table.tokenHash),
    studentIdx: index("telegram_link_tokens_student_idx").on(table.studentId),
  })
);

// 10. Telegram Webhook Updates (Idempotency storage for Telegram webhook updates)
export const telegramUpdates = pgTable("telegram_updates", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Telegram update_id
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});

// 11. Notification Outbox (Reliable asynchronous notification processing)
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 50 }).notNull(), // 'PROXIMITY_10' | 'PROXIMITY_5' | 'TURN_CALLED' | 'ACTIVATION_SUCCESS' | 'BOOKING_CONFIRMATION' | 'CAMPAIGN_MESSAGE'
    recipientId: uuid("recipient_id").references(() => students.id, { onDelete: "set null" }),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).default("PENDING").notNull(), // 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED'
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusAttemptIdx: index("notification_outbox_status_attempt_idx").on(table.status, table.nextAttemptAt),
    idempotencyKeyIdx: index("notification_outbox_idempotency_idx").on(table.idempotencyKey),
  })
);

// 12. Telegram Campaigns (Super Admin bulk announcements)
export const telegramCampaigns = pgTable("telegram_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(), // 'ALL' | 'GROUP' | 'SECTION'
  targetFilters: jsonb("target_filters"), // e.g. { groupId?: string, sectionId?: string }
  status: varchar("status", { length: 20 }).default("DRAFT").notNull(), // 'DRAFT' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  totalRecipients: integer("total_recipients").default(0).notNull(),
  sentCount: integer("sent_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// 13. Telegram Campaign Recipients (Tracking per-student delivery in bulk campaigns)
export const telegramCampaignRecipients = pgTable(
  "telegram_campaign_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => telegramCampaigns.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull(),
    status: varchar("status", { length: 20 }).default("QUEUED").notNull(), // 'QUEUED' | 'SENT' | 'FAILED'
    attempts: integer("attempts").default(0).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => ({
    campaignStudentIdx: uniqueIndex("campaign_recipient_idx").on(table.campaignId, table.studentId),
    campaignStatusIdx: index("campaign_status_idx").on(table.campaignId, table.status),
  })
);

// 14. Message Templates (Pre-defined templates for Telegram broadcast)
export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// 15. Audit Logs (Immutable trail of administrative and sensitive actions)
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: text("entity_id"),
    safeMetadata: jsonb("safe_metadata"), // Stripped of any sensitive personal info
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    actorIdx: index("audit_logs_actor_idx").on(table.actorId),
    actionIdx: index("audit_logs_action_idx").on(table.action),
    entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    createdIdx: index("audit_logs_created_idx").on(table.createdAt),
  })
);

// 16. System Settings (Centralized configuration such as fingerprint activation location)
export const systemSettings = pgTable("system_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Relations definitions
export const groupsRelations = relations(groups, ({ many }) => ({
  sections: many(sections),
  students: many(students),
  bookingWindows: many(bookingWindows),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  group: one(groups, { fields: [sections.groupId], references: [groups.id] }),
  students: many(students),
  schedules: many(sectionSchedules),
  bookingWindows: many(bookingWindows),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  group: one(groups, { fields: [students.groupId], references: [groups.id] }),
  section: one(sections, { fields: [students.sectionId], references: [sections.id] }),
  user: one(users, { fields: [students.userId], references: [users.id] }),
  bookings: many(bookings),
  activations: many(fingerprintActivations),
}));

export const bookingWindowsRelations = relations(bookingWindows, ({ one, many }) => ({
  group: one(groups, { fields: [bookingWindows.groupId], references: [groups.id] }),
  section: one(sections, { fields: [bookingWindows.sectionId], references: [sections.id] }),
  creator: one(users, { fields: [bookingWindows.createdBy], references: [users.id] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  bookingWindow: one(bookingWindows, { fields: [bookings.bookingWindowId], references: [bookingWindows.id] }),
  student: one(students, { fields: [bookings.studentId], references: [students.id] }),
  activations: many(fingerprintActivations),
}));

export const fingerprintActivationsRelations = relations(fingerprintActivations, ({ one }) => ({
  student: one(students, { fields: [fingerprintActivations.studentId], references: [students.id] }),
  booking: one(bookings, { fields: [fingerprintActivations.bookingId], references: [bookings.id] }),
  staff: one(users, { fields: [fingerprintActivations.activatedBy], references: [users.id] }),
}));
