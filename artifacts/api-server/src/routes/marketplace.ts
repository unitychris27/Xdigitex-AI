import { Router } from "express";
import { db } from "@workspace/db";
import { templatesTable } from "@workspace/db";
import { eq, like, and } from "drizzle-orm";

const router = Router();

router.get("/templates", async (req, res) => {
  const { category, search } = req.query as { category?: string; search?: string };
  const conditions = [];
  if (category) conditions.push(eq(templatesTable.category, category as any));
  if (search) conditions.push(like(templatesTable.name, `%${search}%`));
  const templates = conditions.length > 0 ? await db.select().from(templatesTable).where(and(...conditions)) : await db.select().from(templatesTable);
  return res.json(templates.map((t) => ({ ...t, rating: Number(t.rating), price: Number(t.price) })));
});

router.get("/templates/:id", async (req, res) => {
  const [t] = await db.select().from(templatesTable).where(eq(templatesTable.id, parseInt(req.params.id)));
  if (!t) return res.status(404).json({ error: "Not found" });
  return res.json({ ...t, rating: Number(t.rating), price: Number(t.price) });
});

router.post("/templates/:id/install", async (req, res) => {
  const [t] = await db.select().from(templatesTable).where(eq(templatesTable.id, parseInt(req.params.id)));
  if (!t) return res.status(404).json({ error: "Not found" });
  await db.update(templatesTable).set({ downloads: t.downloads + 1 }).where(eq(templatesTable.id, t.id));
  return res.json({ message: `Template "${t.name}" installed successfully` });
});

export default router;
