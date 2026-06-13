import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const agentTypeEnum = pgEnum("agent_type", ["planner", "architect", "frontend", "backend", "devops", "qa", "security", "reviewer", "research", "telegram_bot_builder"]);
export const agentStatusEnum = pgEnum("agent_status", ["idle", "running", "completed", "failed", "paused"]);

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: agentTypeEnum("type").notNull(),
  status: agentStatusEnum("status").notNull().default("idle"),
  projectId: integer("project_id").references(() => projectsTable.id),
  model: text("model"),
  provider: text("provider"),
  task: text("task"),
  progress: integer("progress").notNull().default(0),
  runtime: integer("runtime").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentTimelineTable = pgTable("agent_timeline", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => agentsTable.id).notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("success"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const agentRoutingTable = pgTable("agent_routing", {
  id: serial("id").primaryKey(),
  agentType: text("agent_type").notNull().unique(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
