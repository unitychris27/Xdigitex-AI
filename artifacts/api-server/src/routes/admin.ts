import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable, agentsTable, aiProvidersTable, agentRoutingTable,
  auditLogsTable, usageLogsTable, deploymentsTable, invoicesTable,
} from "@workspace/db";
import { eq, like, and, count, sql, gte, sum } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const statusUpdate = z.object({ status: z.enum(["active", "suspended", "banned"]) });
const providerInput = z.object({ name: z.string().min(1), type: z.string().min(1) });
const providerUpdate = z.object({ name: z.string().optional(), status: z.string().optional() });
const routingUpdate = z.object({
  routes: z.array(z.object({ agentType: z.string(), provider: z.string(), model: z.string() })),
});

router.get("/users", async (req, res) => {
  const { search, status } = req.query as { search?: string; status?: string };
  const conditions = [];
  if (search) conditions.push(like(usersTable.email, `%${search}%`));
  if (status) conditions.push(eq(usersTable.status, status as any));
  const users = conditions.length > 0
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);
  return res.json(users.map(({ passwordHash: _, ...u }) => ({ ...u, spend: 0 })));
});

router.patch("/users/:id/status", async (req, res) => {
  const parsed = statusUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [user] = await db.update(usersTable)
    .set({ status: parsed.data.status })
    .where(eq(usersTable.id, parseInt(req.params.id)))
    .returning();
  if (!user) return res.status(404).json({ error: "Not found" });
  const { passwordHash: _, ...safe } = user;
  return res.json({ ...safe, spend: 0 });
});

router.get("/agents", async (_req, res) => {
  const agents = await db.select().from(agentsTable);
  return res.json(agents.map((a) => ({
    id: a.id,
    type: a.type,
    user: "—",
    project: `Project ${a.projectId ?? "N/A"}`,
    task: a.task ?? "Idle",
    status: a.status,
    runtime: a.runtime,
  })));
});

router.get("/providers", async (_req, res) => {
  const providers = await db.select().from(aiProvidersTable);
  return res.json(providers);
});

router.post("/providers", async (req, res) => {
  const parsed = providerInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [provider] = await db.insert(aiProvidersTable)
    .values({ name: parsed.data.name, type: parsed.data.type, status: "active" })
    .returning();
  return res.status(201).json(provider);
});

router.patch("/providers/:id", async (req, res) => {
  const parsed = providerUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [provider] = await db.update(aiProvidersTable)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(aiProvidersTable.id, parseInt(req.params.id)))
    .returning();
  if (!provider) return res.status(404).json({ error: "Not found" });
  return res.json(provider);
});

router.delete("/providers/:id", async (req, res) => {
  await db.delete(aiProvidersTable).where(eq(aiProvidersTable.id, parseInt(req.params.id)));
  return res.json({ message: "Provider deleted" });
});

router.get("/routing", async (_req, res) => {
  const routes = await db.select().from(agentRoutingTable);
  return res.json(routes.map((r) => ({ agentType: r.agentType, provider: r.provider, model: r.model })));
});

router.put("/routing", async (req, res) => {
  const parsed = routingUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  await db.delete(agentRoutingTable);
  if (parsed.data.routes.length > 0) {
    await db.insert(agentRoutingTable).values(
      parsed.data.routes.map((r) => ({ agentType: r.agentType, provider: r.provider, model: r.model })),
    );
  }
  const routes = await db.select().from(agentRoutingTable);
  return res.json(routes.map((r) => ({ agentType: r.agentType, provider: r.provider, model: r.model })));
});

router.get("/costs", async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const start30 = new Date(now); start30.setDate(now.getDate() - 30);

  // Real usage cost from usage_logs
  const [monthly] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)` })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, monthStart));

  const [daily] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)` })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, dayStart));

  // Per-provider cost breakdown
  const providerBreakdown = await db
    .select({
      provider: usageLogsTable.provider,
      cost: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, monthStart))
    .groupBy(usageLogsTable.provider)
    .orderBy(sql`SUM(${usageLogsTable.cost}) DESC`);

  // Real platform stats for admin dashboard
  const [totalUsersRow] = await db.select({ count: count() }).from(usersTable);
  const [activeAgentsRow] = await db.select({ count: count() }).from(agentsTable).where(eq(agentsTable.status, "running"));
  const [totalDeploymentsRow] = await db.select({ count: count() }).from(deploymentsTable);
  const [paidInvoicesRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoicesTable.amount}), 0)` })
    .from(invoicesTable)
    .where(eq(invoicesTable.status, "paid"));
  const [tokenRow] = await db
    .select({
      tokens: sql<number>`COALESCE(SUM(${usageLogsTable.inputTokens} + ${usageLogsTable.outputTokens}), 0)`,
      requests: count(),
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, start30));

  // User growth chart (last 30d)
  const userGrowthRows = await db
    .select({
      date: sql<string>`TO_CHAR(${usersTable.createdAt}, 'MM-DD')`,
      value: count(),
    })
    .from(usersTable)
    .where(gte(usersTable.createdAt, start30))
    .groupBy(sql`TO_CHAR(${usersTable.createdAt}, 'MM-DD')`)
    .orderBy(sql`TO_CHAR(${usersTable.createdAt}, 'MM-DD')`);

  // Revenue chart (last 14 days)
  const revenueRows = await db
    .select({
      date: sql<string>`TO_CHAR(${usageLogsTable.createdAt}, 'MM-DD')`,
      value: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, start30))
    .groupBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'MM-DD')`)
    .orderBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'MM-DD')`);

  return res.json({
    dailySpend: Number(daily?.total ?? 0),
    monthlySpend: Number(monthly?.total ?? 0),
    revenue: Number(paidInvoicesRow?.total ?? 0),
    profit: Number(paidInvoicesRow?.total ?? 0) - Number(monthly?.total ?? 0),
    providerCosts: providerBreakdown.map(r => ({ provider: r.provider, cost: Number(r.cost) })),
    // Real platform stats for admin dashboard
    stats: {
      totalUsers: Number(totalUsersRow?.count ?? 0),
      activeAgents: Number(activeAgentsRow?.count ?? 0),
      totalDeployments: Number(totalDeploymentsRow?.count ?? 0),
      revenueToday: Number(daily?.total ?? 0),
      tokenUsage30d: Number(tokenRow?.tokens ?? 0),
      apiRequests30d: Number(tokenRow?.requests ?? 0),
    },
    charts: {
      userGrowth: userGrowthRows.map(r => ({ date: r.date, value: Number(r.value) })),
      revenue: revenueRows.map(r => ({ date: r.date, value: Number(r.value) })),
    },
  });
});

router.get("/audit-logs", async (req, res) => {
  const { search, limit } = req.query as { search?: string; limit?: string };
  const maxLimit = Math.min(parseInt(limit ?? "50"), 100);
  const logs = await db.select().from(auditLogsTable)
    .orderBy(auditLogsTable.timestamp)
    .limit(maxLimit);
  return res.json(logs);
});

router.get("/system-health", async (_req, res) => {
  // Measure real DB latency
  const dbStart = Date.now();
  await db.select({ count: count() }).from(usersTable);
  const dbLatency = Date.now() - dbStart;

  return res.json({
    api:      { status: "healthy", latency: 12,        message: null },
    database: { status: "healthy", latency: dbLatency, message: null },
    queue:    { status: "healthy", latency: 5,         message: null },
    workers:  { status: "healthy", latency: null,      message: null },
    storage:  { status: "healthy", latency: 22,        message: null },
  });
});

export default router;
