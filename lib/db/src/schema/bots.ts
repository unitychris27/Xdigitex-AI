import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botStatusEnum = pgEnum("bot_status", ["active", "inactive", "deploying", "error"]);

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: botStatusEnum("status").notNull().default("inactive"),
  tokenHash: text("token_hash"),
  purpose: text("purpose"),
  users: integer("users").notNull().default(0),
  messages: integer("messages").notNull().default(0),
  deployments: integer("deployments").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBotSchema = createInsertSchema(botsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBot = z.infer<typeof insertBotSchema>;
export type Bot = typeof botsTable.$inferSelect;
