import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { signToken } from "../lib/auth.js";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const { data: users, error } = await supabase
    .from("users")
    .select("id, name, email, password_hash, role, roles, organization_id, blocked")
    .ilike("email", email.trim())
    .limit(1);

  if (error || !users?.length) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const user = users[0];
  if (user.blocked) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const roles: string[] = (() => {
    try { return JSON.parse(user.roles ?? "[]"); } catch { return []; }
  })();
  const effectiveRole = user.role || roles[0] || "parent";

  const token = signToken({
    id: String(user.id),
    email: user.email,
    role: effectiveRole,
    orgId: user.organization_id ?? 1,
  });

  res.json({
    token,
    user: {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: effectiveRole,
      orgId: user.organization_id ?? 1,
    },
  });
});

export default router;
