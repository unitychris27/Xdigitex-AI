import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const deployEnvEnum = pgEnum("deploy_env", ["production", "staging", "development"]);
export const deployStatusEnum = pgEnum("deploy_status", ["success", "failed", "deploying", "pending"]);

export const deploymentsTable = pgTable("deployments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projectsTable.id),
  environment: deployEnvEnum("environment").notNull().default("development"),
  status: deployStatusEnum("status").notNull().default("pending"),
  provider: text("provider").notNull().default("railway"),
  version: text("version").notNull().default("1.0.0"),
  url: text("url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
