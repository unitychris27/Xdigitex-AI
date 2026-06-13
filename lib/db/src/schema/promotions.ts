import { pgTable, serial, text, timestamp, integer, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const promotionTypeEnum = pgEnum("promotion_type", ["coupon", "discount", "free_credits", "partner"]);
export const promotionStatusEnum = pgEnum("promotion_status", ["active", "inactive", "expired", "scheduled"]);

export const promotionsTable = pgTable("promotions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: promotionTypeEnum("type").notNull(),
  status: promotionStatusEnum("status").notNull().default("scheduled"),
  discount: numeric("discount", { precision: 5, scale: 2 }),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPromotionSchema = createInsertSchema(promotionsTable).omit({ id: true, createdAt: true });
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type Promotion = typeof promotionsTable.$inferSelect;
