import { Router } from "express";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProposalBody {
  title?: string;
  proposedBy?: string;
  level?: string;
  ageMin?: number;
  ageMax?: number;
  schedule?: { day: string; startTime: string }[];
  campusId?: string;
  campusName?: string;
  room?: string;
  duration?: number;
  capacity?: number;
  notes?: string;
  discipline?: string;
}

interface Proposal extends Required<ProposalBody> {
  id: string;
  status: "pending" | "approved" | "rejected";
  proposedAt: string;
  resolvedAt?: string;
}

// In-memory store
const proposals: Proposal[] = [];

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

/** List all proposals (admin) */
router.get("/workshop-proposals", (req, res) => {
  const status = req.query["status"] as string | undefined;
  const result = status ? proposals.filter(p => p.status === status) : proposals;
  res.json(result);
});

/** Create a new proposal (operator) */
router.post("/workshop-proposals", (req, res) => {
  const body = req.body as ProposalBody;
  if (!body.title || !body.proposedBy) {
    res.status(400).json({ error: "title and proposedBy are required" });
    return;
  }
  const proposal: Proposal = {
    title:       body.title,
    proposedBy:  body.proposedBy,
    level:       body.level       ?? "all",
    ageMin:      body.ageMin      ?? 0,
    ageMax:      body.ageMax      ?? 99,
    schedule:    body.schedule    ?? [],
    campusId:    body.campusId    ?? "",
    campusName:  body.campusName  ?? "",
    room:        body.room        ?? "",
    duration:    body.duration    ?? 60,
    capacity:    body.capacity    ?? 15,
    notes:       body.notes       ?? "",
    discipline:  body.discipline  ?? "",
    id:         `wp-${Date.now()}`,
    status:     "pending",
    proposedAt: new Date().toISOString(),
  };
  proposals.push(proposal);
  req.log.info({ id: proposal.id, title: proposal.title }, "workshop proposal created");
  res.status(201).json(proposal);
});

/** Approve a proposal (admin) */
router.put("/workshop-proposals/:id/approve", (req, res) => {
  const p = proposals.find(x => x.id === req.params["id"]);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  p.status     = "approved";
  p.resolvedAt = new Date().toISOString();
  req.log.info({ id: p.id }, "workshop proposal approved");
  res.json(p);
});

/** Reject a proposal (admin) */
router.put("/workshop-proposals/:id/reject", (req, res) => {
  const p = proposals.find(x => x.id === req.params["id"]);
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  p.status     = "rejected";
  p.resolvedAt = new Date().toISOString();
  req.log.info({ id: p.id }, "workshop proposal rejected");
  res.json(p);
});

export default router;
