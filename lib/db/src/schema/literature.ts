import { pgTable, text, timestamp, integer, customType } from "drizzle-orm/pg-core";

// Drizzle-orm v0.45 does not ship a first-class `bytea` column — define it via customType.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const LITERATURE_CATEGORIES = ["sop", "cheat_sheet", "training", "policy", "other"] as const;
export type LiteratureCategory = (typeof LITERATURE_CATEGORIES)[number];

export const literature = pgTable("literature", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  venueId: text("venue_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().$type<LiteratureCategory>().default("other"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  fileData: bytea("file_data").notNull(),
  uploadedByUserId: text("uploaded_by_user_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Literature = typeof literature.$inferSelect;
