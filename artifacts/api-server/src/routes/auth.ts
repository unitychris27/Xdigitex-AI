import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { name, email, password } = parsed.data;
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) return res.status(400).json({ error: "Email already in use" });
  const [user] = await db.insert(usersTable).values({ name, email, passwordHash: password, role: "user", status: "active" }).returning();
  const { passwordHash: _, ...safeUser } = user;
  return res.status(201).json({ user: safeUser, token: `mock-token-${user.id}` });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { email } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const { passwordHash: _, ...safeUser } = user;
  return res.json({ user: safeUser, token: `mock-token-${user.id}` });
});

router.get("/me", async (req, res) => {
  const [user] = await db.select().from(usersTable).limit(1);
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  const { passwordHash: _, ...safeUser } = user;
  return res.json(safeUser);
});

router.post("/logout", async (_req, res) => {
  return res.json({ message: "Logged out successfully" });
});

export default router;
