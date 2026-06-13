import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "moderator", "support", "user"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "banned"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull().default(""),
  role: userRoleEnum("role").notNull().default("user"),
  status: userStatusEnum("status").notNull().default("active"),
  avatarUrl: text("avatar_url"),
  googleId: text("google_id"),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
