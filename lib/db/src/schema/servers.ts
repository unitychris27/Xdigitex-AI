import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serverStatusEnum = pgEnum("server_status", ["online", "offline", "error", "connecting"]);
export const serverAuthEnum = pgEnum("server_auth_type", ["key", "password"]);

export const serversTable = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("custom"),
  status: serverStatusEnum("status").notNull().default("offline"),
  location: text("location").notNull().default("us-east-1"),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  username: text("username").notNull(),
  authType: serverAuthEnum("auth_type").notNull().default("key"),
  privateKey: text("private_key"),
  password: text("password"),
  privateKeyHash: text("private_key_hash"),
  githubToken: text("github_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertServerSchema = createInsertSchema(serversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof serversTable.$inferSelect;

export const serverTaskHistoryTable = pgTable("server_task_history", {
  id:               serial("id").primaryKey(),
  serverId:         integer("server_id").references(() => serversTable.id, { onDelete: "cascade" }).notNull(),
  task:             text("task").notNull(),
  summary:          text("summary"),
  model:            text("model"),
  promptTokens:     integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens:      integer("total_tokens").notNull().default(0),
  iterations:       integer("iterations").notNull().default(0),
  durationMs:       integer("duration_ms").notNull().default(0),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

export type ServerTaskHistory = typeof serverTaskHistoryTable.$inferSelect;
