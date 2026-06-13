import { Router } from "express";
import { db } from "@workspace/db";
import { referralsTable, referralLinksTable } from "@workspace/db";

const router = Router();

router.get("/", async (_req, res) => {
  const monthlyEarnings = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    return { date: d.toISOString().slice(0, 7), value: Math.random() * 500 + 100 };
  });
  return res.json({
    referralLink: "https://xdigitex.ai/ref/usr_abc123",
    totalReferrals: 24,
    activeReferrals: 18,
    earnings: 1840.50,
    conversionRate: 75,
    monthlyEarnings,
  });
});

router.get("/list", async (_req, res) => {
  const referrals = await db.select().from(referralsTable);
  return res.json(referrals.map((r) => ({ id: r.id, email: r.referredEmail, name: r.referredName, status: r.status, commission: Number(r.commission), joinedAt: r.joinedAt })));
});

export default router;
