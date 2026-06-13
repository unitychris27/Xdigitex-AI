import { Router } from "express";
import { db } from "@workspace/db";
import { serversTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const serverInput = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  username: z.string().min(1),
  privateKey: z.string().min(1),
  port: z.number().optional(),
  provider: z.string().optional(),
  location: z.string().optional(),
});
const serverUpdate = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
});

router.get("/", async (_req, res) => {
  const servers = await db.select().from(serversTable);
  return res.json(servers.map(({ privateKeyHash: _, ...s }) => s));
});

router.post("/", async (req, res) => {
  const parsed = serverInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [server] = await db.insert(serversTable).values({
    name: parsed.data.name,
    host: parsed.data.host,
    username: parsed.data.username,
    privateKeyHash: `hash_${parsed.data.privateKey.slice(-4)}`,
    port: parsed.data.port ?? 22,
    provider: parsed.data.provider ?? "custom",
    location: parsed.data.location ?? "us-east-1",
    status: "connecting",
  }).returning();
  await db.insert(activityTable).values({
    type: "server_connected",
    description: `Server "${server.name}" added`,
    user: "Admin",
  });
  const { privateKeyHash: _, ...safeServer } = server;
  return res.status(201).json(safeServer);
});

router.get("/:id", async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });
  const { privateKeyHash: _, ...safe } = s;
  return res.json(safe);
});

router.patch("/:id", async (req, res) => {
  const parsed = serverUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [s] = await db.update(serversTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(serversTable.id, parseInt(req.params.id)))
    .returning();
  if (!s) return res.status(404).json({ error: "Not found" });
  const { privateKeyHash: _, ...safe } = s;
  return res.json(safe);
});

router.delete("/:id", async (req, res) => {
  await db.delete(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  return res.json({ message: "Server deleted" });
});

router.get("/:id/metrics", async (req, res) => {
  const [s] = await db.select().from(serversTable).where(eq(serversTable.id, parseInt(req.params.id)));
  if (!s) return res.status(404).json({ error: "Not found" });

  // Uptime is calculated from the createdAt timestamp (real)
  const uptimeSeconds = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 1000);

  // CPU, RAM, storage are not tracked server-side without an SSH agent.
  // Return zeros until a monitoring agent reports actual values.
  return res.json({
    cpu: 0,
    ram: 0,
    storage: 0,
    network: 0,
    uptime: uptimeSeconds,
    status: s.status,
    note: "Live metrics require a monitoring agent installed on the server",
  });
});

export default router;
