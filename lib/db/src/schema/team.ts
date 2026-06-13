import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const teamRoleEnum = pgEnum("team_role", ["owner", "admin", "developer", "billing_manager", "viewer"]);
export const teamMemberStatusEnum = pgEnum("team_member_status", ["active", "pending", "suspended"]);

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: teamRoleEnum("role").notNull().default("developer"),
  status: teamMemberStatusEnum("status").notNull().default("active"),
  avatarUrl: text("avatar_url"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({ id: true, joinedAt: true });
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembersTable.$inferSelect;
