import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const projectStatusEnum = pgEnum("project_status", ["active", "paused", "completed", "archived"]);
export const deploymentStatusEnum = pgEnum("deployment_status_type", ["deployed", "deploying", "failed", "not_deployed"]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: projectStatusEnum("status").notNull().default("active"),
  repositoryUrl: text("repository_url"),
  deploymentStatus: deploymentStatusEnum("deployment_status").notNull().default("not_deployed"),
  ownerId: integer("owner_id").references(() => usersTable.id),
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
