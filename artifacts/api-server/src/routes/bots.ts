import { Router } from "express";
import { db } from "@workspace/db";
import { botsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const botInput = z.object({ name: z.string().min(1), description: z.string().optional(), token: z.string().min(1), purpose: z.string().optional() });
const botUpdate = z.object({ name: z.string().optional(), description: z.string().optional(), status: z.string().optional() });

router.get("/", async (_req, res) => {
  const bots = await db.select().from(botsTable);
  return res.json(bots.map(({ tokenHash: _, ...b }) => b));
});

router.post("/", async (req, res) => {
  const parsed = botInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [bot] = await db.insert(botsTable).values({ name: parsed.data.name, description: parsed.data.description, tokenHash: `hash_${parsed.data.token.slice(-4)}`, purpose: parsed.data.purpose, status: "inactive" }).returning();
  const { tokenHash: _, ...safeBot } = bot;
  return res.status(201).json(safeBot);
});

router.get("/:id", async (req, res) => {
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, parseInt(req.params.id)));
  if (!bot) return res.status(404).json({ error: "Not found" });
  const { tokenHash: _, ...safeBot } = bot;
  return res.json(safeBot);
});

router.patch("/:id", async (req, res) => {
  const parsed = botUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [bot] = await db.update(botsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(botsTable.id, parseInt(req.params.id))).returning();
  if (!bot) return res.status(404).json({ error: "Not found" });
  const { tokenHash: _, ...safeBot } = bot;
  return res.json(safeBot);
});

router.delete("/:id", async (req, res) => {
  await db.delete(botsTable).where(eq(botsTable.id, parseInt(req.params.id)));
  return res.json({ message: "Bot deleted" });
});

router.post("/:id/deploy", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(botsTable).set({ status: "deploying", updatedAt: new Date() }).where(eq(botsTable.id, id));
  await db.insert(activityTable).values({ type: "bot_deployed", description: `Bot deployment initiated`, user: "Admin" });
  setTimeout(async () => {
    await db.update(botsTable).set({ status: "active", deployments: 1, updatedAt: new Date() }).where(eq(botsTable.id, id));
  }, 3000);
  return res.json({ message: "Deployment started" });
});

router.get("/:id/analytics", async (req, res) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().split("T")[0], value: Math.floor(Math.random() * 200 + 50) };
  });
  return res.json({ totalUsers: 1240, totalMessages: 8920, activeUsers: 380, dailyMessages: days });
});

export default router;
