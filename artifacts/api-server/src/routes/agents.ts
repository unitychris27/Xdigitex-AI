import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, agentTimelineTable, agentRoutingTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const agentInput = z.object({ name: z.string().min(1), type: z.string(), projectId: z.number().optional(), task: z.string().optional(), model: z.string().optional() });

router.get("/", async (req, res) => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };
  const conditions = [];
  if (projectId) conditions.push(eq(agentsTable.projectId, parseInt(projectId)));
  if (status) conditions.push(eq(agentsTable.status, status as any));
  const agents = conditions.length > 0 ? await db.select().from(agentsTable).where(and(...conditions)) : await db.select().from(agentsTable);
  return res.json(agents);
});

router.post("/", async (req, res) => {
  const parsed = agentInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [agent] = await db.insert(agentsTable).values({ ...parsed.data, status: "idle", progress: 0, runtime: 0 }).returning();
  return res.status(201).json(agent);
});

router.get("/routing", async (_req, res) => {
  const routes = await db.select().from(agentRoutingTable);
  return res.json(routes.map((r) => ({ agentType: r.agentType, provider: r.provider, model: r.model })));
});

router.get("/:id", async (req, res) => {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, parseInt(req.params.id)));
  if (!agent) return res.status(404).json({ error: "Not found" });
  return res.json(agent);
});

router.delete("/:id", async (req, res) => {
  await db.delete(agentsTable).where(eq(agentsTable.id, parseInt(req.params.id)));
  return res.json({ message: "Agent stopped and deleted" });
});

router.get("/:id/timeline", async (req, res) => {
  const events = await db.select().from(agentTimelineTable).where(eq(agentTimelineTable.agentId, parseInt(req.params.id)));
  return res.json(events);
});

export default router;
