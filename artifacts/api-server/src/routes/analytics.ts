import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, deploymentsTable, usageLogsTable, agentsTable, botsTable } from "@workspace/db";
import { gte, count, sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const period = (req.query.period as string) ?? "30d";
  const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "90d" ? 90 : period === "1y" ? 365 : 30;
  const startDate = new Date(); startDate.setDate(startDate.getDate() - days);

  // Users registered per day
  const userRows = await db
    .select({
      date: sql<string>`TO_CHAR(${usersTable.createdAt}, 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(usersTable)
    .where(gte(usersTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${usersTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${usersTable.createdAt}, 'YYYY-MM-DD')`);

  // Deployments per day
  const deployRows = await db
    .select({
      date: sql<string>`TO_CHAR(${deploymentsTable.createdAt}, 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(deploymentsTable)
    .where(gte(deploymentsTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${deploymentsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${deploymentsTable.createdAt}, 'YYYY-MM-DD')`);

  // AI token usage per day
  const usageRows = await db
    .select({
      date: sql<string>`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`,
      value: sql<number>`COALESCE(SUM(${usageLogsTable.inputTokens} + ${usageLogsTable.outputTokens}), 0)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`);

  // Revenue per day (from usage cost)
  const revenueRows = await db
    .select({
      date: sql<string>`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`,
      value: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)`,
    })
    .from(usageLogsTable)
    .where(gte(usageLogsTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${usageLogsTable.createdAt}, 'YYYY-MM-DD')`);

  // Agent runs per day
  const agentRows = await db
    .select({
      date: sql<string>`TO_CHAR(${agentsTable.createdAt}, 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(agentsTable)
    .where(gte(agentsTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${agentsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${agentsTable.createdAt}, 'YYYY-MM-DD')`);

  // Bot activity per day
  const botRows = await db
    .select({
      date: sql<string>`TO_CHAR(${botsTable.createdAt}, 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(botsTable)
    .where(gte(botsTable.createdAt, startDate))
    .groupBy(sql`TO_CHAR(${botsTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${botsTable.createdAt}, 'YYYY-MM-DD')`);

  // Totals
  const [totalUsersRow] = await db.select({ count: count() }).from(usersTable);
  const [totalDeployRow] = await db.select({ count: count() }).from(deploymentsTable);
  const [totalRevenueRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageLogsTable.cost}), 0)` })
    .from(usageLogsTable);

  return res.json({
    users: userRows.map(r => ({ date: r.date, value: Number(r.value) })),
    revenue: revenueRows.map(r => ({ date: r.date, value: Number(r.value) })),
    deployments: deployRows.map(r => ({ date: r.date, value: Number(r.value) })),
    agentUsage: agentRows.map(r => ({ date: r.date, value: Number(r.value) })),
    botActivity: botRows.map(r => ({ date: r.date, value: Number(r.value) })),
    tokenUsage: usageRows.map(r => ({ date: r.date, value: Number(r.value) })),
    totalUsers: Number(totalUsersRow?.count ?? 0),
    totalRevenue: Number(totalRevenueRow?.total ?? 0),
    totalDeployments: Number(totalDeployRow?.count ?? 0),
  });
});

export default router;
