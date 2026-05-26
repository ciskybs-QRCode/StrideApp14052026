import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { signToken } from "../lib/auth.js";

const router = Router();

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school";
}

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

router.post("/auth/register", async (req, res) => {
  const { name, email, password, org_slug } = req.body as {
    name: string; email: string; password: string; org_slug?: string;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "Name, email and password are required" });
    return;
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email.trim())
    .limit(1);

  if (existing?.length) {
    res.status(409).json({ error: "This email is already registered" });
    return;
  }

  let orgId = 1;
  if (org_slug) {
    const { data: orgs } = await supabase.from("organizations").select("id, name");
    if (orgs?.length) {
      const match = orgs.find(o => toSlug(o.name ?? "") === org_slug);
      if (match) orgId = match.id;
    }
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      role: "parent",
      organization_id: orgId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, name, email, role, organization_id")
    .single();

  if (insertError || !newUser) {
    res.status(500).json({ error: insertError?.message ?? "Registration failed" });
    return;
  }

  const token = signToken({
    id: String(newUser.id),
    email: newUser.email,
    role: newUser.role,
    orgId: (newUser.organization_id as number | null) ?? orgId,
  });

  res.status(201).json({
    token,
    user: {
      id: String(newUser.id),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      orgId: (newUser.organization_id as number | null) ?? orgId,
    },
  });
});

export default router;
