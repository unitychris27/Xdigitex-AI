import { pgTable, serial, text, timestamp, integer, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const referralStatusEnum = pgEnum("referral_status", ["active", "inactive", "pending"]);

export const referralLinksTable = pgTable("referral_links", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  code: text("code").notNull().unique(),
  totalReferrals: integer("total_referrals").notNull().default(0),
  activeReferrals: integer("active_referrals").notNull().default(0),
  earnings: numeric("earnings", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").references(() => usersTable.id).notNull(),
  referredEmail: text("referred_email").notNull(),
  referredName: text("referred_name").notNull().default(""),
  status: referralStatusEnum("status").notNull().default("pending"),
  commission: numeric("commission", { precision: 10, scale: 2 }).notNull().default("0"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
