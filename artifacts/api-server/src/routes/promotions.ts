import { Router } from "express";
import { db } from "@workspace/db";
import { promotionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const promoInput = z.object({ name: z.string().min(1), type: z.string(), discount: z.number().optional(), startDate: z.string(), endDate: z.string() });

router.get("/", async (_req, res) => {
  const promos = await db.select().from(promotionsTable);
  return res.json(promos.map((p) => ({ ...p, discount: p.discount ? Number(p.discount) : null })));
});

router.post("/", async (req, res) => {
  const parsed = promoInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [promo] = await db.insert(promotionsTable).values({ name: parsed.data.name, type: parsed.data.type as any, discount: parsed.data.discount?.toString(), startDate: new Date(parsed.data.startDate), endDate: new Date(parsed.data.endDate), status: "scheduled" }).returning();
  return res.status(201).json({ ...promo, discount: promo.discount ? Number(promo.discount) : null });
});

router.delete("/:id", async (req, res) => {
  await db.delete(promotionsTable).where(eq(promotionsTable.id, parseInt(req.params.id)));
  return res.json({ message: "Promotion deleted" });
});

export default router;
