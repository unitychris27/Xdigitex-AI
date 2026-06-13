import { Router } from "express";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";

const router = Router();

const keyInput = z.object({ name: z.string().min(1) });

router.get("/", async (_req, res) => {
  const keys = await db.select().from(apiKeysTable);
  return res.json(keys.map(({ keyHash: _, ...k }) => k));
});

router.post("/", async (req, res) => {
  const parsed = keyInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const raw = `xdx_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const [key] = await db.insert(apiKeysTable).values({ name: parsed.data.name, prefix, keyHash: raw }).returning();
  const { keyHash: _, ...safeKey } = key;
  return res.status(201).json({ ...safeKey, key: raw });
});

router.delete("/:id", async (req, res) => {
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, parseInt(req.params.id)));
  return res.json({ message: "API key deleted" });
});

export default router;
