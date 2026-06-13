import { Router } from "express";
import { db } from "@workspace/db";
import { teamMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const inviteInput = z.object({ email: z.string().email(), role: z.string() });
const memberUpdate = z.object({ role: z.string() });

router.get("/members", async (_req, res) => {
  const members = await db.select().from(teamMembersTable);
  return res.json(members);
});

router.post("/members", async (req, res) => {
  const parsed = inviteInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  return res.json({ message: `Invitation sent to ${parsed.data.email}` });
});

router.patch("/members/:id", async (req, res) => {
  const parsed = memberUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [member] = await db.update(teamMembersTable).set({ role: parsed.data.role as any }).where(eq(teamMembersTable.id, parseInt(req.params.id))).returning();
  if (!member) return res.status(404).json({ error: "Not found" });
  return res.json(member);
});

router.delete("/members/:id", async (req, res) => {
  await db.delete(teamMembersTable).where(eq(teamMembersTable.id, parseInt(req.params.id)));
  return res.json({ message: "Member removed" });
});

export default router;
