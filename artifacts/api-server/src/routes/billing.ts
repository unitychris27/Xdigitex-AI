import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, usageLogsTable } from "@workspace/db";

const router = Router();

router.get("/overview", async (_req, res) => {
  return res.json({
    plan: "Pro",
    monthlyCost: 149.00,
    tokenUsage: 2840000,
    tokenLimit: 10000000,
    apiRequests: 48200,
    storageUsage: 12.4,
    storageLimit: 100,
    renewalDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
  });
});

router.get("/invoices", async (_req, res) => {
  const invoices = await db.select().from(invoicesTable).orderBy(invoicesTable.date);
  return res.json(invoices.map((i) => ({ id: i.invoiceRef, amount: Number(i.amount), currency: i.currency, status: i.status, date: i.date, downloadUrl: i.downloadUrl })));
});

router.get("/plans", async (_req, res) => {
  return res.json([
    { id: "free", name: "Free", price: 0, period: "month", features: ["3 projects", "1 agent", "100K tokens/mo", "Community support"], current: false, tokenLimit: 100000, agentLimit: 1 },
    { id: "starter", name: "Starter", price: 29, period: "month", features: ["10 projects", "5 agents", "1M tokens/mo", "Email support"], current: false, tokenLimit: 1000000, agentLimit: 5 },
    { id: "pro", name: "Pro", price: 149, period: "month", features: ["Unlimited projects", "20 agents", "10M tokens/mo", "Priority support", "Custom models"], current: true, tokenLimit: 10000000, agentLimit: 20 },
    { id: "business", name: "Business", price: 499, period: "month", features: ["Unlimited projects", "100 agents", "50M tokens/mo", "24/7 support", "SLA", "Custom integrations"], current: false, tokenLimit: 50000000, agentLimit: 100 },
    { id: "enterprise", name: "Enterprise", price: 0, period: "custom", features: ["Unlimited everything", "Dedicated infrastructure", "Custom SLA", "Dedicated support"], current: false, tokenLimit: -1, agentLimit: -1 },
  ]);
});

router.get("/usage", async (req, res) => {
  const period = (req.query.period as string) ?? "30d";
  const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;
  const daily = Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (Math.min(days, 30) - 1 - i));
    return { date: d.toISOString().split("T")[0], value: Math.random() * 200 + 50 };
  });
  return res.json({ daily, modelCosts: [{ model: "GPT-4o", cost: 45.20, tokens: 1200000 }, { model: "Claude Sonnet", cost: 38.80, tokens: 980000 }, { model: "DeepSeek Chat", cost: 12.40, tokens: 660000 }] });
});

export default router;
