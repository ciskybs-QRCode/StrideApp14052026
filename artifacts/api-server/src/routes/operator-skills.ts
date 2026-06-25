import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole, type TokenPayload } from "../lib/auth.js";
import { pool } from "../lib/pg.js";
import { supabase } from "../lib/supabase.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

// ── GET /operator-skills ───────────────────────────────────────────────────────
// Operator: get own skills + completion status.
// Admin: get any profile's skills via ?profileId=N

router.get("/operator-skills", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const profileId = req.query["profileId"] ? parseInt(String(req.query["profileId"])) : null;

  try {
    let opProfileId: number | null = null;
    let skillsCompleted = false;

    if (user.role === "operator") {
      const { data: profile } = await supabase
        .from("operator_profiles")
        .select("id, skills_completed")
        .eq("user_id", parseInt(String(user.id)))
        .eq("organization_id", user.orgId)
        .maybeSingle();
      opProfileId    = (profile as { id?: number } | null)?.id ?? null;
      skillsCompleted = (profile as { skills_completed?: boolean } | null)?.skills_completed ?? false;
    } else if ((user.role === "admin" || user.role === "super_admin") && profileId) {
      const { data: profile } = await supabase
        .from("operator_profiles")
        .select("id, skills_completed")
        .eq("id", profileId)
        .eq("organization_id", user.orgId)
        .maybeSingle();
      opProfileId    = (profile as { id?: number } | null)?.id ?? null;
      skillsCompleted = (profile as { skills_completed?: boolean } | null)?.skills_completed ?? false;
    }

    if (!opProfileId) {
      res.json({ skills: [], skills_completed: false });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, label, source FROM operator_skills WHERE operator_profile_id = $1 ORDER BY label`,
      [opProfileId],
    );

    res.json({ skills: rows, skills_completed: skillsCompleted });
  } catch (err) {
    req.log.error(err, "GET /operator-skills");
    res.status(500).json({ error: "Failed to get skills" });
  }
});

// ── GET /operator-skills/all ───────────────────────────────────────────────────
// Admin only: get skills for every active operator in the org.

router.get("/operator-skills/all", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const { data: profiles } = await supabase
      .from("operator_profiles")
      .select("id, skills_completed, user:users!user_id(id, name)")
      .eq("organization_id", user.orgId)
      .eq("active", true);

    const ids = (profiles ?? []).map((p: Record<string, unknown>) => p["id"] as number);
    const { rows: allSkills } = ids.length
      ? await pool.query(`SELECT operator_profile_id, label FROM operator_skills WHERE operator_profile_id = ANY($1)`, [ids])
      : { rows: [] };

    const skillMap: Record<number, string[]> = {};
    for (const r of allSkills) {
      if (!skillMap[r.operator_profile_id]) skillMap[r.operator_profile_id] = [];
      skillMap[r.operator_profile_id].push(r.label as string);
    }

    const result = (profiles ?? []).map((p: Record<string, unknown>) => {
      const u = p["user"] as { id?: number; name?: string } | null;
      const pid = p["id"] as number;
      return {
        operator_profile_id: pid,
        operator_user_id: u?.id,
        name: u?.name ?? "Unnamed",
        skills_completed: (p["skills_completed"] as boolean) ?? false,
        skills: skillMap[pid] ?? [],
      };
    });

    res.json(result);
  } catch (err) {
    req.log.error(err, "GET /operator-skills/all");
    res.status(500).json({ error: "Failed to load operator skills" });
  }
});

// ── PUT /operator-skills ───────────────────────────────────────────────────────
// Operator: replace own skills and mark skills_completed = true.

router.put("/operator-skills", requireAuth, requireRole("operator", "admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { labels } = req.body as { labels: string[] };

  if (!Array.isArray(labels)) {
    res.status(400).json({ error: "labels must be an array" });
    return;
  }

  try {
    const { data: profile } = await supabase
      .from("operator_profiles")
      .select("id")
      .eq("user_id", parseInt(String(user.id)))
      .eq("organization_id", user.orgId)
      .maybeSingle();

    const opProfileId = (profile as { id?: number } | null)?.id;
    if (!opProfileId) {
      // No operator profile yet — acknowledge gracefully so the user can proceed
      res.json({ ok: true });
      return;
    }

    await pool.query(`DELETE FROM operator_skills WHERE operator_profile_id = $1`, [opProfileId]);

    const cleanLabels = labels.map(l => String(l).trim()).filter(Boolean);
    if (cleanLabels.length > 0) {
      const placeholders = cleanLabels.map((_, i) => `($1, $2, $${i + 3})`).join(", ");
      await pool.query(
        `INSERT INTO operator_skills (operator_profile_id, organization_id, label) VALUES ${placeholders}`,
        [opProfileId, user.orgId, ...cleanLabels],
      );
    }

    await supabase
      .from("operator_profiles")
      .update({ skills_completed: true })
      .eq("id", opProfileId)
      .then(undefined, () => {});

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "PUT /operator-skills");
    res.status(500).json({ error: "Failed to save skills" });
  }
});

// ── GET /skill-presets ─────────────────────────────────────────────────────────
// Any authenticated user: get preset labels (disciplines + admin custom labels).

router.get("/skill-presets", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const [{ data: disciplines }, { rows: custom }] = await Promise.all([
      supabase.from("disciplines").select("name").eq("organization_id", user.orgId).eq("active", true),
      pool.query(`SELECT id, label FROM skill_label_presets WHERE organization_id = $1 ORDER BY label`, [user.orgId]),
    ]);

    const discPresets = (disciplines ?? []).map((d: Record<string, unknown>) => ({
      id: null as null, label: String(d["name"]), source: "discipline" as const,
    }));
    const customPresets = custom.map(r => ({ id: r.id as number, label: r.label as string, source: "custom" as const }));

    res.json({ presets: [...discPresets, ...customPresets] });
  } catch (err) {
    req.log.error(err, "GET /skill-presets");
    res.status(500).json({ error: "Failed to get presets" });
  }
});

// ── POST /skill-presets ────────────────────────────────────────────────────────
// Admin: add a custom skill label preset.

router.post("/skill-presets", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { label } = req.body as { label: string };
  if (!label?.trim()) { res.status(400).json({ error: "label is required" }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO skill_label_presets (organization_id, label)
       VALUES ($1, $2)
       ON CONFLICT (organization_id, label) DO UPDATE SET label = EXCLUDED.label
       RETURNING *`,
      [user.orgId, label.trim()],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    req.log.error(err, "POST /skill-presets");
    res.status(500).json({ error: "Failed to add preset" });
  }
});

// ── DELETE /skill-presets/:id ──────────────────────────────────────────────────
// Admin: remove a custom preset.

router.delete("/skill-presets/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(String(req.params.id));
  try {
    await pool.query(`DELETE FROM skill_label_presets WHERE id = $1 AND organization_id = $2`, [id, user.orgId]);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "DELETE /skill-presets/:id");
    res.status(500).json({ error: "Failed to delete preset" });
  }
});

// ── POST /operator-skills/ai-match ────────────────────────────────────────────
// Admin: AI finds the best-fit operator for an activity based on skills.

router.post("/operator-skills/ai-match", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  const user = (req as AuthReq).user;
  const { activityType, discipline, requiredSkills = [], notes = "" } = req.body as {
    activityType: string;
    discipline?: string;
    requiredSkills?: string[];
    notes?: string;
  };

  try {
    const { data: profiles } = await supabase
      .from("operator_profiles")
      .select("id, user:users!user_id(id, name)")
      .eq("organization_id", user.orgId)
      .eq("active", true);

    if (!profiles || profiles.length === 0) {
      res.json({ matches: [] });
      return;
    }

    const ids = profiles.map((p: Record<string, unknown>) => p["id"] as number);
    const { rows: allSkills } = await pool.query(
      `SELECT operator_profile_id, label FROM operator_skills WHERE operator_profile_id = ANY($1)`,
      [ids],
    );

    const skillMap: Record<number, string[]> = {};
    for (const r of allSkills) {
      if (!skillMap[r.operator_profile_id]) skillMap[r.operator_profile_id] = [];
      skillMap[r.operator_profile_id].push(r.label as string);
    }

    const opList = profiles.map((p: Record<string, unknown>) => {
      const u = p["user"] as { id?: number; name?: string } | null;
      const pid = p["id"] as number;
      const skills = skillMap[pid] ?? [];
      return `- ${u?.name ?? "Unnamed"} (profileId:${pid}): skills=[${skills.join(", ") || "none listed"}]`;
    }).join("\n");

    const prompt = `You are a neutral scheduling assistant for a sports and activities association.
An administrator needs to assign an instructor to a new activity.

Activity:
- Type: ${activityType}
${discipline ? `- Subject / discipline: ${discipline}` : ""}
${requiredSkills.length > 0 ? `- Skills the admin is looking for: ${requiredSkills.join(", ")}` : ""}
${notes ? `- Notes: ${notes}` : ""}

Instructors and their self-reported skills:
${opList}

Rank the top 3 best-fit instructors by skills relevance. Do NOT mention dance, sport names, or any activity-specific language in the reason — keep reasons generic.
Return ONLY a valid JSON array. Each element:
- "operator_profile_id": number
- "name": string
- "reason": string (max 60 chars, plain English, no sport/activity names)
- "confidence": "high" | "medium" | "low"
Return only the JSON array, no markdown.`;

    let matches: { operator_profile_id: number; name: string; reason: string; confidence: string }[] = [];

    try {
      const { openai } = await import("@workspace/integrations-openai-ai-server");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      });
      const raw = (completion.choices[0]?.message?.content ?? "").trim();
      const jsonStr = raw.startsWith("[") ? raw : raw.replace(/^[^[]*/, "").replace(/[^\]]*$/, "");
      matches = JSON.parse(jsonStr);
    } catch {
      // Fallback: skill-overlap scoring
      matches = profiles
        .map((p: Record<string, unknown>) => {
          const pid = p["id"] as number;
          const u = p["user"] as { name?: string } | null;
          const skills = skillMap[pid] ?? [];
          const overlap = requiredSkills.filter(s =>
            skills.some(sk => sk.toLowerCase().includes(s.toLowerCase()))
          ).length;
          const conf = overlap > 0 ? "high" : skills.length > 0 ? "medium" : "low";
          return {
            operator_profile_id: pid,
            name: u?.name ?? "Unnamed",
            reason: skills.length > 0 ? `Has ${skills.length} matching skill${skills.length > 1 ? "s" : ""}` : "No skills listed yet",
            confidence: conf,
          };
        })
        .sort((a, b) => (a.confidence === "high" ? -1 : b.confidence === "high" ? 1 : 0))
        .slice(0, 3);
    }

    res.json({ matches });
  } catch (err) {
    req.log.error(err, "POST /operator-skills/ai-match");
    res.status(500).json({ error: "Failed to match operator" });
  }
});

export default router;
