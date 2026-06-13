import { Router } from "express";

const router = Router();

function genSeries(days: number, min: number, max: number) {
  return Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (Math.min(days, 30) - 1 - i));
    return { date: d.toISOString().split("T")[0], value: Math.floor(Math.random() * (max - min) + min) };
  });
}

router.get("/", async (req, res) => {
  const period = (req.query.period as string) ?? "30d";
  const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;
  return res.json({
    users: genSeries(days, 100, 500),
    revenue: genSeries(days, 2000, 15000),
    deployments: genSeries(days, 5, 50),
    agentUsage: genSeries(days, 10, 100),
    botActivity: genSeries(days, 50, 300),
    totalUsers: 2847,
    totalRevenue: 124800,
    totalDeployments: 1842,
  });
});

export default router;
