import { Router, type Request } from "express";
import { supabase } from "../lib/supabase.js";
import { requireAuth, type TokenPayload } from "../lib/auth.js";

const router = Router();
type AuthReq = Request & { user: TokenPayload };

router.get("/enrollment-requests", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;

  let query = supabase
    .from("enrollment_requests")
    .select("*")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  if (user.role === "parent") {
    query = query.eq("parent_user_id", String(user.id));
  }

  const { data, error } = await query;
  if (error) {
    req.log.error(error);
    if ((error as { code?: string }).code === "42P01" ||
        (error.message ?? "").includes("schema cache") ||
        (error.message ?? "").includes("not in the schema")) { res.json([]); return; }
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
});

router.post("/enrollment-requests", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  const body = req.body as {
    courseId: string;
    courseName: string;
    participantName: string;
    participantAge?: number;
    participantSkillLevel?: string;
    packageType: string;
    price: number;
    validationIssue: string;
    cartItemId: string;
  };

  const { data, error } = await supabase
    .from("enrollment_requests")
    .insert({
      org_id: user.orgId,
      course_id: body.courseId,
      course_name: body.courseName,
      participant_name: body.participantName,
      participant_age: body.participantAge ?? null,
      participant_skill_level: body.participantSkillLevel ?? null,
      package_type: body.packageType,
      price: body.price,
      validation_issue: body.validationIssue,
      cart_item_id: body.cartItemId,
      parent_user_id: String(user.id),
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    req.log.error(error);
    if ((error as { code?: string }).code === "42P01") {
      res.status(503).json({ error: "Enrollment requests table not initialised. Contact your administrator." });
      return;
    }
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

router.patch("/enrollment-requests/:id", requireAuth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (user.role === "parent") {
    res.status(403).json({ error: "Forbidden: only operators can review requests" });
    return;
  }

  const { status, notes } = req.body as { status: "approved" | "rejected"; notes?: string };
  if (!["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    return;
  }

  const { data, error } = await supabase
    .from("enrollment_requests")
    .update({
      status,
      operator_notes: notes ?? null,
      reviewed_by: String(user.id),
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.params["id"]!)
    .eq("org_id", user.orgId)
    .select()
    .single();

  if (error) {
    req.log.error(error);
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
