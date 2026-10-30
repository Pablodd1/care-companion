import {
  bigint,
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  birthYear: int("birthYear"),
  conditions: text("conditions").notNull(),
  allergies: text("allergies").notNull(),
  dietInstructions: text("dietInstructions").notNull(),
  careNotes: text("careNotes").notNull(),
  calorieTarget: int("calorieTarget"),
  carbLimit: double("carbLimit"),
  sugarLimit: double("sugarLimit"),
  proteinTarget: double("proteinTarget"),
  sodiumLimit: int("sodiumLimit"),
  fluidTarget: int("fluidTarget"),
  timezone: varchar("timezone", { length: 64 }).default("UTC").notNull(),
  bpSystolicHigh: int("bpSystolicHigh"),
  bpDiastolicHigh: int("bpDiastolicHigh"),
  bpSystolicLow: int("bpSystolicLow"),
  bpDiastolicLow: int("bpDiastolicLow"),
  inviteCode: varchar("inviteCode", { length: 24 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const memberships = mysqlTable(
  "memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    role: mysqlEnum("role", ["caregiver", "parent"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientUserUnique: uniqueIndex("membership_patient_user_unique").on(
      table.patientId,
      table.userId,
    ),
    userIdx: index("membership_user_idx").on(table.userId),
  }),
);

export const medications = mysqlTable(
  "medications",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    strength: varchar("strength", { length: 120 }).notNull(),
    dose: varchar("dose", { length: 180 }).notNull(),
    instructions: text("instructions").notNull(),
    scheduleTimes: text("scheduleTimes").notNull(),
    prescribingClinician: varchar("prescribingClinician", { length: 180 }).notNull(),
    active: boolean("active").default(true).notNull(),
    confirmedBy: bigint("confirmedBy", { mode: "number", unsigned: true }).notNull(),
    confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    patientIdx: index("medication_patient_idx").on(table.patientId),
  }),
);

export const medicationSchedules = mysqlTable(
  "medication_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    medicationId: bigint("medicationId", { mode: "number", unsigned: true }).notNull(),
    dose: varchar("dose", { length: 180 }).notNull(),
    instructions: text("instructions").notNull(),
    scheduleTimes: text("scheduleTimes").notNull(),
    effectiveFrom: varchar("effectiveFrom", { length: 10 }).notNull(),
    effectiveTo: varchar("effectiveTo", { length: 10 }),
    reason: text("reason").notNull(),
    confirmedBy: bigint("confirmedBy", { mode: "number", unsigned: true }).notNull(),
    confirmedAt: timestamp("confirmedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    medicationDayIdx: index("medication_schedule_day_idx").on(
      table.medicationId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    patientIdx: index("medication_schedule_patient_idx").on(table.patientId),
  }),
);

export const doseLogs = mysqlTable(
  "dose_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    medicationId: bigint("medicationId", { mode: "number", unsigned: true }).notNull(),
    day: varchar("day", { length: 10 }).notNull(),
    slot: varchar("slot", { length: 5 }).notNull(),
    status: mysqlEnum("status", ["taken", "missed", "skipped"]).notNull(),
    note: text("note").notNull(),
    photoKey: text("photoKey"),
    loggedBy: bigint("loggedBy", { mode: "number", unsigned: true }).notNull(),
    loggedAt: timestamp("loggedAt").defaultNow().notNull(),
  },
  (table) => ({
    doseUnique: uniqueIndex("dose_unique").on(table.medicationId, table.day, table.slot),
    patientDayIdx: index("dose_patient_day_idx").on(table.patientId, table.day),
  }),
);

export const bloodPressureReadings = mysqlTable(
  "blood_pressure_readings",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    systolic: int("systolic").notNull(),
    diastolic: int("diastolic").notNull(),
    pulse: int("pulse"),
    measuredAt: timestamp("measuredAt").notNull(),
    position: varchar("position", { length: 40 }).default("seated").notNull(),
    notes: text("notes").notNull(),
    photoKey: text("photoKey"),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientMeasuredIdx: index("bp_patient_measured_idx").on(table.patientId, table.measuredAt),
  }),
);

export const meals = mysqlTable(
  "meals",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    eatenDay: varchar("eatenDay", { length: 10 }).notNull(),
    eatenAt: timestamp("eatenAt").notNull(),
    mealType: mysqlEnum("mealType", ["breakfast", "lunch", "dinner", "snack", "drink"]).notNull(),
    note: text("note").notNull(),
    photoKey: text("photoKey"),
    analysisStatus: mysqlEnum("analysisStatus", ["complete", "manual", "failed"]).notNull(),
    items: text("items").notNull(),
    calories: int("calories"),
    carbs: double("carbs"),
    sugar: double("sugar"),
    addedSugar: double("addedSugar"),
    fiber: double("fiber"),
    protein: double("protein"),
    fat: double("fat"),
    saturatedFat: double("saturatedFat"),
    sodium: int("sodium"),
    potassium: int("potassium"),
    fluid: int("fluid"),
    confidence: mysqlEnum("confidence", ["low", "medium", "high", "unknown"]).default("unknown").notNull(),
    caregiverFlags: text("caregiverFlags").notNull(),
    patientMessage: text("patientMessage").notNull(),
    reviewedBy: bigint("reviewedBy", { mode: "number", unsigned: true }),
    reviewedAt: timestamp("reviewedAt"),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientDayIdx: index("meal_patient_day_idx").on(table.patientId, table.eatenDay),
  }),
);

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    kind: mysqlEnum("kind", ["prescription", "medicine_photo", "lab_report", "genetic", "care_plan", "other"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    fileKey: text("fileKey").notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    contentType: varchar("contentType", { length: 120 }).notNull(),
    notes: text("notes").notNull(),
    uploadedBy: bigint("uploadedBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientIdx: index("document_patient_idx").on(table.patientId),
  }),
);

export const alerts = mysqlTable(
  "alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    kind: mysqlEnum("kind", ["medication", "nutrition", "blood_pressure", "system"]).notNull(),
    severity: mysqlEnum("severity", ["info", "review"]).default("review").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    resolvedBy: bigint("resolvedBy", { mode: "number", unsigned: true }),
    resolvedAt: timestamp("resolvedAt"),
  },
  (table) => ({
    patientStatusIdx: index("alert_patient_status_idx").on(table.patientId, table.status),
  }),
);

export const labReports = mysqlTable(
  "lab_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    documentId: bigint("documentId", { mode: "number", unsigned: true }),
    title: varchar("title", { length: 180 }).notNull(),
    reportDate: varchar("reportDate", { length: 10 }).notNull(),
    confirmedBy: bigint("confirmedBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientDateIdx: index("lab_report_patient_date_idx").on(table.patientId, table.reportDate),
  }),
);

export const labResults = mysqlTable(
  "lab_results",
  {
    id: int("id").autoincrement().primaryKey(),
    reportId: bigint("reportId", { mode: "number", unsigned: true }).notNull(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    value: double("value").notNull(),
    unit: varchar("unit", { length: 40 }).notNull(),
    referenceLow: double("referenceLow"),
    referenceHigh: double("referenceHigh"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    reportIdx: index("lab_result_report_idx").on(table.reportId),
    patientNameIdx: index("lab_result_patient_name_idx").on(table.patientId, table.name),
  }),
);

export const healthNotes = mysqlTable(
  "health_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    kind: mysqlEnum("kind", ["symptom", "note"]).notNull(),
    body: text("body").notNull(),
    severity: int("severity"),
    occurredAt: timestamp("occurredAt").notNull(),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientTimeIdx: index("health_note_patient_time_idx").on(table.patientId, table.occurredAt),
  }),
);

export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    role: mysqlEnum("role", ["user", "assistant"]).notNull(),
    body: text("body").notNull(),
    sources: text("sources").notNull(),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientTimeIdx: index("chat_message_patient_time_idx").on(table.patientId, table.createdAt),
  }),
);

export const careAuditEvents = mysqlTable(
  "care_audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    actorUserId: bigint("actorUserId", { mode: "number", unsigned: true }).notNull(),
    entityType: mysqlEnum("entityType", ["medication", "dose", "meal", "lab", "note", "reminder", "review"]).notNull(),
    entityId: varchar("entityId", { length: 80 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    reason: text("reason").notNull(),
    beforeJson: text("beforeJson"),
    afterJson: text("afterJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    patientTimeIdx: index("care_audit_patient_time_idx").on(table.patientId, table.createdAt),
    entityIdx: index("care_audit_entity_idx").on(table.entityType, table.entityId),
  }),
);

export const careReviewItems = mysqlTable(
  "care_review_items",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    sourceKey: varchar("sourceKey", { length: 190 }).notNull().unique(),
    kind: mysqlEnum("kind", ["medication", "dose", "nutrition", "lab", "note", "system"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
    resolution: text("resolution").notNull(),
    createdBy: bigint("createdBy", { mode: "number", unsigned: true }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    reviewedBy: bigint("reviewedBy", { mode: "number", unsigned: true }),
    reviewedAt: timestamp("reviewedAt"),
  },
  (table) => ({
    patientStatusIdx: index("care_review_patient_status_idx").on(table.patientId, table.status),
  }),
);

export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    endpointHash: varchar("endpointHash", { length: 64 }).notNull().unique(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: varchar("userAgent", { length: 500 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
  },
  (table) => ({
    patientUserIdx: index("push_subscription_patient_user_idx").on(table.patientId, table.userId),
  }),
);

export const reminderDeliveries = mysqlTable(
  "reminder_deliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    medicationId: bigint("medicationId", { mode: "number", unsigned: true }).notNull(),
    day: varchar("day", { length: 10 }).notNull(),
    slot: varchar("slot", { length: 5 }).notNull(),
    status: mysqlEnum("status", ["sent", "no_subscriptions", "failed"]).notNull(),
    recipientCount: int("recipientCount").default(0).notNull(),
    detail: varchar("detail", { length: 240 }).notNull(),
    attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
  },
  (table) => ({
    doseUnique: uniqueIndex("reminder_delivery_dose_unique").on(table.medicationId, table.day, table.slot),
    patientDayIdx: index("reminder_delivery_patient_day_idx").on(table.patientId, table.day),
  }),
);

export const foodItems = mysqlTable("food_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 140 }).notNull().unique(),
  category: varchar("category", { length: 80 }).notNull(),
  portionUnit: mysqlEnum("portionUnit", ["g", "ml"]).notNull(),
  calories: double("calories").notNull(),
  carbs: double("carbs").notNull(),
  sugar: double("sugar").notNull(),
  addedSugar: double("addedSugar").notNull(),
  fiber: double("fiber").notNull(),
  protein: double("protein").notNull(),
  fat: double("fat").notNull(),
  saturatedFat: double("saturatedFat").notNull(),
  sodium: double("sodium").notNull(),
  potassium: double("potassium").notNull(),
  fluid: double("fluid").notNull(),
  sourceName: varchar("sourceName", { length: 140 }).default("Care Companion baseline").notNull(),
  sourceUrl: text("sourceUrl"),
  sourceReference: varchar("sourceReference", { length: 120 }),
  reviewedOn: varchar("reviewedOn", { length: 10 }),
});

export const mealComponents = mysqlTable(
  "meal_components",
  {
    id: int("id").autoincrement().primaryKey(),
    mealId: bigint("mealId", { mode: "number", unsigned: true }).notNull(),
    patientId: bigint("patientId", { mode: "number", unsigned: true }).notNull(),
    foodItemId: bigint("foodItemId", { mode: "number", unsigned: true }),
    name: varchar("name", { length: 180 }).notNull(),
    grams: double("grams"),
    estimationSource: mysqlEnum("estimationSource", ["reference", "photo", "manual"]).notNull(),
    calories: double("calories"),
    carbs: double("carbs"),
    sugar: double("sugar"),
    addedSugar: double("addedSugar"),
    fiber: double("fiber"),
    protein: double("protein"),
    fat: double("fat"),
    saturatedFat: double("saturatedFat"),
    sodium: double("sodium"),
    potassium: double("potassium"),
    fluid: double("fluid"),
  },
  (table) => ({
    mealIdx: index("meal_component_meal_idx").on(table.mealId),
    patientIdx: index("meal_component_patient_idx").on(table.patientId),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Patient = typeof patients.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Medication = typeof medications.$inferSelect;
export type MedicationSchedule = typeof medicationSchedules.$inferSelect;
export type DoseLog = typeof doseLogs.$inferSelect;
export type BloodPressureReading = typeof bloodPressureReadings.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type LabReport = typeof labReports.$inferSelect;
export type LabResult = typeof labResults.$inferSelect;
export type HealthNote = typeof healthNotes.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type CareAuditEvent = typeof careAuditEvents.$inferSelect;
export type CareReviewItem = typeof careReviewItems.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type ReminderDelivery = typeof reminderDeliveries.$inferSelect;
export type FoodItem = typeof foodItems.$inferSelect;
export type MealComponent = typeof mealComponents.$inferSelect;
