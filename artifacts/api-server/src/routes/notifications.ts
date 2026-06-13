import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const notifs = await db.select().from(notificationsTable).orderBy(notificationsTable.createdAt);
  return res.json(notifs);
});

router.post("/:id/read", async (req, res) => {
  await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, parseInt(req.params.id)));
  return res.json({ message: "Marked as read" });
});

router.post("/read-all", async (_req, res) => {
  await db.update(notificationsTable).set({ read: true });
  return res.json({ message: "All marked as read" });
});

export default router;
