import { Router } from "express";
import { db } from "@workspace/db";
import { referralsTable, referralLinksTable, usersTable } from "@workspace/db";
import { eq, sum, count, sql, gte } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  // Aggregate stats across all referral links
  const [linkStats] = await db
    .select({
      totalReferrals: sql<number>`COALESCE(SUM(${referralLinksTable.totalReferrals}), 0)`,
      activeReferrals: sql<number>`COALESCE(SUM(${referralLinksTable.activeReferrals}), 0)`,
      earnings: sql<number>`COALESCE(SUM(${referralLinksTable.earnings}), 0)`,
    })
    .from(referralLinksTable);

  const totalReferrals = Number(linkStats?.totalReferrals ?? 0);
  const activeReferrals = Number(linkStats?.activeReferrals ?? 0);
  const earnings = Number(linkStats?.earnings ?? 0);
  const conversionRate = totalReferrals > 0 ? Math.round((activeReferrals / totalReferrals) * 100) : 0;

  // Monthly earnings trend from referral data grouped by month
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyRows = await db
    .select({
      date: sql<string>`TO_CHAR(${referralsTable.joinedAt}, 'YYYY-MM')`,
      value: sql<number>`COALESCE(SUM(${referralsTable.commission}), 0)`,
    })
    .from(referralsTable)
    .where(gte(referralsTable.joinedAt, sixMonthsAgo))
    .groupBy(sql`TO_CHAR(${referralsTable.joinedAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${referralsTable.joinedAt}, 'YYYY-MM')`);

  // Get the first referral link code for the link URL (or show placeholder)
  const [firstLink] = await db.select().from(referralLinksTable).limit(1);
  const referralLink = firstLink
    ? `https://xdigitex.ai/ref/${firstLink.code}`
    : "No referral link yet — create one below";

  return res.json({
    referralLink,
    totalReferrals,
    activeReferrals,
    earnings,
    conversionRate,
    monthlyEarnings: monthlyRows.map(r => ({ date: r.date, value: Number(r.value) })),
  });
});

router.get("/list", async (_req, res) => {
  const referrals = await db.select().from(referralsTable).orderBy(referralsTable.joinedAt);
  return res.json(referrals.map((r) => ({
    id: r.id,
    email: r.referredEmail,
    name: r.referredName,
    status: r.status,
    commission: Number(r.commission),
    joinedAt: r.joinedAt,
  })));
});

export default router;
