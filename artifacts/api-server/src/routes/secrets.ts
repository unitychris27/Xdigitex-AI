import { Router } from "express";
import { db } from "@workspace/db";
import { secretsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const secretInput = z.object({ name: z.string().min(1), description: z.string().optional(), type: z.string(), value: z.string().min(1), environment: z.string() });
const rotateInput = z.object({ newValue: z.string().min(1) });

router.get("/", async (_req, res) => {
  const secrets = await db.select().from(secretsTable);
  return res.json(secrets.map(({ encryptedValue: _, ...s }) => s));
});

router.post("/", async (req, res) => {
  const parsed = secretInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const encrypted = Buffer.from(parsed.data.value).toString("base64");
  const [secret] = await db.insert(secretsTable).values({ name: parsed.data.name, description: parsed.data.description, type: parsed.data.type as any, encryptedValue: encrypted, environment: parsed.data.environment as any }).returning();
  const { encryptedValue: _, ...safe } = secret;
  return res.status(201).json(safe);
});

router.delete("/:id", async (req, res) => {
  await db.delete(secretsTable).where(eq(secretsTable.id, parseInt(req.params.id)));
  return res.json({ message: "Secret deleted" });
});

router.post("/:id/rotate", async (req, res) => {
  const parsed = rotateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const encrypted = Buffer.from(parsed.data.newValue).toString("base64");
  const [secret] = await db.update(secretsTable).set({ encryptedValue: encrypted, updatedAt: new Date() }).where(eq(secretsTable.id, parseInt(req.params.id))).returning();
  if (!secret) return res.status(404).json({ error: "Not found" });
  const { encryptedValue: _, ...safe } = secret;
  return res.json(safe);
});

export default router;
