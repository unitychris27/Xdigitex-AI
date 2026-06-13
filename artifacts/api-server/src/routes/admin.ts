import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, agentsTable, aiProvidersTable, agentRoutingTable, auditLogsTable } from "@workspace/db";
import { eq, like, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const statusUpdate = z.object({ status: z.enum(["active", "suspended", "banned"]) });
const providerInput = z.object({ name: z.string().min(1), type: z.string().min(1) });
const providerUpdate = z.object({ name: z.string().optional(), status: z.string().optional() });
const routingUpdate = z.object({ routes: z.array(z.object({ agentType: z.string(), provider: z.string(), model: z.string() })) });

router.get("/users", async (req, res) => {
  const { search, status } = req.query as { search?: string; status?: string };
  const conditions = [];
  if (search) conditions.push(like(usersTable.email, `%${search}%`));
  if (status) conditions.push(eq(usersTable.status, status as any));
  const users = conditions.length > 0 ? await db.select().from(usersTable).where(and(...conditions)) : await db.select().from(usersTable);
  return res.json(users.map(({ passwordHash: _, ...u }) => ({ ...u, spend: Math.random() * 500 })));
});

router.patch("/users/:id/status", async (req, res) => {
  const parsed = statusUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [user] = await db.update(usersTable).set({ status: parsed.data.status }).where(eq(usersTable.id, parseInt(req.params.id))).returning();
  if (!user) return res.status(404).json({ error: "Not found" });
  const { passwordHash: _, ...safe } = user;
  return res.json({ ...safe, spend: 0 });
});

router.get("/agents", async (_req, res) => {
  const agents = await db.select().from(agentsTable);
  return res.json(agents.map((a) => ({ id: a.id, type: a.type, user: "user@example.com", project: `Project ${a.projectId ?? "N/A"}`, task: a.task ?? "Idle", status: a.status, runtime: a.runtime })));
});

router.get("/providers", async (_req, res) => {
  const providers = await db.select().from(aiProvidersTable);
  return res.json(providers);
});

router.post("/providers", async (req, res) => {
  const parsed = providerInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [provider] = await db.insert(aiProvidersTable).values({ name: parsed.data.name, type: parsed.data.type, status: "active" }).returning();
  return res.status(201).json(provider);
});

router.patch("/providers/:id", async (req, res) => {
  const parsed = providerUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [provider] = await db.update(aiProvidersTable).set({ ...parsed.data, updatedAt: new Date() } as any).where(eq(aiProvidersTable.id, parseInt(req.params.id))).returning();
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
    await db.insert(agentRoutingTable).values(parsed.data.routes.map((r) => ({ agentType: r.agentType, provider: r.provider, model: r.model })));
  }
  const routes = await db.select().from(agentRoutingTable);
  return res.json(routes.map((r) => ({ agentType: r.agentType, provider: r.provider, model: r.model })));
});

router.get("/costs", async (_req, res) => {
  return res.json({ dailySpend: 42.80, monthlySpend: 1284.40, revenue: 12480.00, profit: 11195.60, providerCosts: [{ provider: "OpenAI", cost: 540.20 }, { provider: "Anthropic", cost: 380.80 }, { provider: "DeepSeek", cost: 124.40 }, { provider: "Google", cost: 239.00 }] });
});

router.get("/audit-logs", async (req, res) => {
  const { search, limit } = req.query as { search?: string; limit?: string };
  const maxLimit = Math.min(parseInt(limit ?? "50"), 100);
  const logs = await db.select().from(auditLogsTable).limit(maxLimit);
  return res.json(logs);
});

router.get("/system-health", async (_req, res) => {
  return res.json({
    api: { status: "healthy", latency: 48, message: null },
    database: { status: "healthy", latency: 12, message: null },
    queue: { status: "healthy", latency: 5, message: null },
    workers: { status: "warning", latency: null, message: "2 workers under high load" },
    storage: { status: "healthy", latency: 22, message: null },
  });
});

export default router;
