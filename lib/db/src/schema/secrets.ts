import { pgTable, serial, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const secretTypeEnum = pgEnum("secret_type", ["api_key", "ssh_key", "database_credential", "token", "certificate"]);
export const secretEnvEnum = pgEnum("secret_env", ["production", "staging", "development", "all"]);

export const secretsTable = pgTable("secrets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: secretTypeEnum("type").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  environment: secretEnvEnum("environment").notNull().default("all"),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSecretSchema = createInsertSchema(secretsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSecret = z.infer<typeof insertSecretSchema>;
export type Secret = typeof secretsTable.$inferSelect;
