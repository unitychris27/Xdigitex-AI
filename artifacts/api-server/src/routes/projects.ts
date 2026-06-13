import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable, agentsTable, deploymentsTable, activityTable } from "@workspace/db";
import { eq, like, count, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const projectInput = z.object({ name: z.string().min(1), description: z.string().default(""), repositoryUrl: z.string().optional() });
const projectUpdate = z.object({ name: z.string().optional(), description: z.string().optional(), status: z.string().optional(), repositoryUrl: z.string().optional() });

router.get("/", async (req, res) => {
  const { search, status } = req.query as { search?: string; status?: string };
  let query = db.select().from(projectsTable);
  const conditions = [];
  if (search) conditions.push(like(projectsTable.name, `%${search}%`));
  if (status) conditions.push(eq(projectsTable.status, status as any));
  const projects = conditions.length > 0 ? await db.select().from(projectsTable).where(and(...conditions)) : await query;
  const enriched = await Promise.all(projects.map(async (p) => {
    const [agentCount] = await db.select({ count: count() }).from(agentsTable).where(eq(agentsTable.projectId, p.id));
    const [deployCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.projectId, p.id));
    return { ...p, agentCount: Number(agentCount?.count ?? 0), deploymentCount: Number(deployCount?.count ?? 0) };
  }));
  return res.json(enriched);
});

router.post("/", async (req, res) => {
  const parsed = projectInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [project] = await db.insert(projectsTable).values({ ...parsed.data, status: "active", deploymentStatus: "not_deployed" }).returning();
  await db.insert(activityTable).values({ type: "project_created", description: `Project "${project.name}" created`, user: "Admin" });
  return res.status(201).json({ ...project, agentCount: 0, deploymentCount: 0 });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) return res.status(404).json({ error: "Not found" });
  const [agentCount] = await db.select({ count: count() }).from(agentsTable).where(eq(agentsTable.projectId, id));
  const [deployCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.projectId, id));
  return res.json({ ...project, agentCount: Number(agentCount?.count ?? 0), deploymentCount: Number(deployCount?.count ?? 0) });
});

router.patch("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = projectUpdate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const [project] = await db.update(projectsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(projectsTable.id, id)).returning();
  if (!project) return res.status(404).json({ error: "Not found" });
  return res.json({ ...project, agentCount: 0, deploymentCount: 0 });
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  return res.json({ message: "Project deleted" });
});

router.get("/:id/logs", async (req, res) => {
  const id = parseInt(req.params.id);
  const logs = [
    { id: 1, message: `Project ${id} initialized`, level: "info", timestamp: new Date(Date.now() - 3600000) },
    { id: 2, message: "Dependencies installed", level: "info", timestamp: new Date(Date.now() - 2400000) },
    { id: 3, message: "Build completed", level: "info", timestamp: new Date(Date.now() - 1200000) },
    { id: 4, message: "Deployment started", level: "info", timestamp: new Date() },
  ];
  return res.json(logs);
});

export default router;
