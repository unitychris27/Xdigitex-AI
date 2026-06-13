import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, agentsTable, botsTable, activityTable, usersTable, usageLogsTable } from "@workspace/db";
import { eq, count, gte, lt, sum, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/stats", async (_req, res) => {
  const now = new Date();
  const start30 = new Date(now); start30.setDate(now.getDate() - 30);
  const start60 = new Date(now); start60.setDate(now.getDate() - 60);

  const [projects] = await db.select({ count: count() }).from(projectsTable);
  const [activeAgents] = await db.select({ count: count() }).from(agentsTable).where(eq(agentsTable.status, "running"));
  const [bots] = await db.select({ count: count() }).from(botsTable).where(eq(botsTable.status, "active"));
  const [activeUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "active"));

  // Monthly usage cost from real AI usage logs
  const [usageCurrent] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)` })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, start30));

  const [usagePrev] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)` })
    .from(usageLogsTable)
    .where(and(gte(usageLogsTable.createdAt, start60), lt(usageLogsTable.createdAt, start30)));

  // Projects comparison
  const [projectsPrev] = await db.select({ count: count() }).from(projectsTable)
    .where(lt(projectsTable.createdAt, start30));
  const [projectsCurrent] = await db.select({ count: count() }).from(projectsTable)
    .where(gte(projectsTable.createdAt, start30));

  // Agents comparison
  const [agentsCurrent] = await db.select({ count: count() }).from(agentsTable)
    .where(gte(agentsTable.createdAt, start30));
  const [agentsPrev] = await db.select({ count: count() }).from(agentsTable)
    .where(lt(agentsTable.createdAt, start30));

  // Bots comparison
  const [botsCurrent] = await db.select({ count: count() }).from(botsTable)
    .where(gte(botsTable.createdAt, start30));
  const [botsPrev] = await db.select({ count: count() }).from(botsTable)
    .where(lt(botsTable.createdAt, start30));

  const pctChange = (cur: number, prev: number) =>
    prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10;

  const monthlyUsage = Number(usageCurrent?.total ?? 0);
  const prevUsage = Number(usagePrev?.total ?? 0);

  return res.json({
    projects: Number(projects?.count ?? 0),
    activeAgents: Number(activeAgents?.count ?? 0),
    botsDeployed: Number(bots?.count ?? 0),
    activeUsers: Number(activeUsers?.count ?? 0),
    monthlyUsage,
    monthlyUsageChange: pctChange(monthlyUsage, prevUsage),
    projectsChange: pctChange(Number(projectsCurrent?.count ?? 0), Number(projectsPrev?.count ?? 0)),
    agentsChange: pctChange(Number(agentsCurrent?.count ?? 0), Number(agentsPrev?.count ?? 0)),
    botsChange: pctChange(Number(botsCurrent?.count ?? 0), Number(botsPrev?.count ?? 0)),
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
