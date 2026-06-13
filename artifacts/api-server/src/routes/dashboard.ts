import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, agentsTable, botsTable, activityTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const router = Router();

router.get("/stats", async (_req, res) => {
  const [projects] = await db.select({ count: count() }).from(projectsTable);
  const [activeAgents] = await db.select({ count: count() }).from(agentsTable).where(eq(agentsTable.status, "running"));
  const [bots] = await db.select({ count: count() }).from(botsTable).where(eq(botsTable.status, "active"));
  return res.json({
    projects: Number(projects?.count ?? 0),
    activeAgents: Number(activeAgents?.count ?? 0),
    botsDeployed: Number(bots?.count ?? 0),
    monthlyUsage: 2840.50,
    revenue: 12480.00,
    activeUsers: 247,
    projectsChange: 12.5,
    agentsChange: -3.2,
    botsChange: 8.1,
    revenueChange: 15.3,
  });
});

router.get("/activity", async (_req, res) => {
  const items = await db.select().from(activityTable).orderBy(activityTable.createdAt).limit(20);
  return res.json(items.map((a) => ({ id: a.id, type: a.type, description: a.description, user: a.user, createdAt: a.createdAt })));
});

router.get("/agents", async (_req, res) => {
  const agents = await db.select().from(agentsTable).limit(10);
  return res.json(agents.map((a) => ({
    id: a.id, name: a.name, type: a.type, status: a.status,
    progress: a.progress, currentTask: a.task ?? "Idle", model: a.model, runtime: a.runtime,
  })));
});

export default router;
