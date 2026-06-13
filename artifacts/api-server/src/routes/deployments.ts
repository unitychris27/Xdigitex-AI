import { Router } from "express";
import { db } from "@workspace/db";
import { deploymentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const deployInput = z.object({ projectId: z.number(), environment: z.string(), provider: z.string(), version: z.string().optional() });

router.get("/", async (req, res) => {
  const { projectId, environment } = req.query as { projectId?: string; environment?: string };
  const conditions = [];
  if (projectId) conditions.push(eq(deploymentsTable.projectId, parseInt(projectId)));
  if (environment) conditions.push(eq(deploymentsTable.environment, environment as any));
  const items = conditions.length > 0 ? await db.select().from(deploymentsTable).where(and(...conditions)) : await db.select().from(deploymentsTable);
  return res.json(items);
});

router.post("/", async (req, res) => {
  const parsed = deployInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [deployment] = await db.insert(deploymentsTable).values({ ...parsed.data, environment: parsed.data.environment as any, status: "deploying", version: parsed.data.version ?? "1.0.0" }).returning();
  return res.status(201).json(deployment);
});

router.get("/:id", async (req, res) => {
  const [d] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, parseInt(req.params.id)));
  if (!d) return res.status(404).json({ error: "Not found" });
  return res.json(d);
});

router.delete("/:id", async (req, res) => {
  await db.delete(deploymentsTable).where(eq(deploymentsTable.id, parseInt(req.params.id)));
  return res.json({ message: "Deployment deleted" });
});

router.get("/:id/logs", async (req, res) => {
  const logs = [
    { id: 1, message: "Pulling latest image...", level: "info", timestamp: new Date(Date.now() - 60000) },
    { id: 2, message: "Container started", level: "info", timestamp: new Date(Date.now() - 45000) },
    { id: 3, message: "Health check passed", level: "info", timestamp: new Date(Date.now() - 30000) },
    { id: 4, message: "Deployment complete", level: "info", timestamp: new Date() },
  ];
  return res.json(logs);
});

export default router;
