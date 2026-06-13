import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, usageLogsTable } from "@workspace/db";
import { gte, sql, count } from "drizzle-orm";

const router = Router();

router.get("/overview", async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Real token usage this month
  const [tokenRow] = await db
    .select({
      tokens: sql<number>`COALESCE(SUM(${usageLogsTable.inputTokens} + ${usageLogsTable.outputTokens}), 0)`,
      cost: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)`,
      requests: count(),
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, monthStart));

  const tokenUsage = Number(tokenRow?.tokens ?? 0);
  const monthlyCost = Number(tokenRow?.cost ?? 0);
  const apiRequests = Number(tokenRow?.requests ?? 0);

  return res.json({
    plan: "free",
    monthlyCost,
    tokenUsage,
    tokenLimit: 100000,
    apiRequests,
    storageUsage: 0,
    storageLimit: 100,
    renewalDate: nextMonth,
  });
});

router.get("/invoices", async (_req, res) => {
  const invoices = await db.select().from(invoicesTable).orderBy(invoicesTable.date);
  return res.json(invoices.map((i) => ({
    id: i.invoiceRef,
    amount: Number(i.amount),
    currency: i.currency,
    status: i.status,
    date: i.date,
    downloadUrl: i.downloadUrl,
  })));
});

router.get("/plans", async (_req, res) => {
  return res.json([
    { id: "free",       name: "Free",       price: 0,   period: "month", features: ["3 projects", "1 agent", "100K tokens/mo", "Community support"],                                    current: true,  tokenLimit: 100000,    agentLimit: 1   },
    { id: "starter",    name: "Starter",    price: 29,  period: "month", features: ["10 projects", "5 agents", "1M tokens/mo", "Email support"],                                        current: false, tokenLimit: 1000000,   agentLimit: 5   },
    { id: "pro",        name: "Pro",        price: 149, period: "month", features: ["Unlimited projects", "20 agents", "10M tokens/mo", "Priority support", "Custom models"],            current: false, tokenLimit: 10000000,  agentLimit: 20  },
    { id: "business",   name: "Business",   price: 499, period: "month", features: ["Unlimited projects", "100 agents", "50M tokens/mo", "24/7 support", "SLA", "Custom integrations"], current: false, tokenLimit: 50000000,  agentLimit: 100 },
    { id: "enterprise", name: "Enterprise", price: 0,   period: "custom", features: ["Unlimited everything", "Dedicated infrastructure", "Custom SLA", "Dedicated support"],            current: false, tokenLimit: -1,        agentLimit: -1  },
  ]);
});

router.get("/usage", async (req, res) => {
  const period = (req.query.period as string) ?? "30d";
  const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;
  const startDate = new Date(); startDate.setDate(startDate.getDate() - days);

  // Real daily cost from usage_logs
  const dailyRows = await db
    .select({
      date: sql<string>`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`,
      value: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`);

  // Real model cost breakdown
  const modelRows = await db
    .select({
      model: usageLogsTable.model,
      cost: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)`,
      tokens: sql<number>`COALESCE(SUM(${usageLogsTable.inputTokens} + ${usageLogsTable.outputTokens}), 0)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, startDate))
    .groupBy(usageLogsTable.model)
    .orderBy(sql`SUM(${usageLogsTable.cost}) DESC`);

  return res.json({
    daily: dailyRows.map(r => ({ date: r.date, value: Number(r.value) })),
    modelCosts: modelRows.map(r => ({ model: r.model, cost: Number(r.cost), tokens: Number(r.tokens) })),
  });
});

export default router;
