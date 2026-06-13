import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const REDIRECT_URI = (() => {
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const primary = domains.split(",")[0]?.trim();
  if (primary) return `https://${primary}/api/auth/google/callback`;
  return "http://localhost:80/api/auth/google/callback";
})();

function getClient() {
  return new OAuth2Client(
    process.env["GOOGLE_CLIENT_ID"],
    process.env["GOOGLE_CLIENT_SECRET"],
    REDIRECT_URI,
  );
}

// GET /api/auth/google — redirect to Google consent screen
router.get("/google", (_req, res) => {
  const client = getClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  });
  res.redirect(url);
});

// GET /api/auth/google/callback — handle code exchange
router.get("/google/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  if (!code) {
    return res.redirect("/?error=missing_code");
  }

  try {
    const client = getClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env["GOOGLE_CLIENT_ID"],
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.redirect("/login?error=no_email");
    }

    const { email, name, sub: googleId } = payload;

    // Upsert user
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
    let user;

    if (existing.length > 0) {
      user = existing[0]!;
      // Update name/googleId if missing
      if (!user.googleId) {
        const [updated] = await db
          .update(usersTable)
          .set({ googleId, name: user.name || name || email })
          .where(eq(usersTable.id, user.id))
          .returning();
        user = updated!;
      }
    } else {
      const [created] = await db
        .insert(usersTable)
        .values({
          email,
          name: name ?? email,
          googleId,
          passwordHash: "",
          role: "user",
          status: "active",
        })
        .returning();
      user = created!;
    }

    const { passwordHash: _, ...safeUser } = user;
    const token = `mock-token-${user.id}`;

    // Redirect back to frontend with user data encoded in the URL
    const userData = encodeURIComponent(JSON.stringify({ user: safeUser, token }));
    const isAdmin = ["super_admin", "admin", "moderator", "support"].includes(safeUser.role ?? "");
    const dest = isAdmin ? "/admin" : "/dashboard";
    res.redirect(`/login?oauth_success=${userData}&dest=${dest}`);
  } catch (err: any) {
    req.log?.error({ err }, "Google OAuth error");
    res.redirect(`/login?error=${encodeURIComponent(err?.message ?? "oauth_failed")}`);
  }
});

export { REDIRECT_URI };
export default router;
