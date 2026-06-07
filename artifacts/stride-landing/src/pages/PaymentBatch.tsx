import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type BatchSessionStatus = {
  position:      number;
  sessionId:     string;
  status:        "pending" | "complete" | "expired";
  checkoutUrl:   string | null;
  orgId:         number;
  orgName:       string | null;
  amountCents:   number;
  invoiceNumber: string | null;
};

type BatchStatus = {
  batchId:        string;
  status:         "pending" | "partial" | "complete" | "abandoned";
  totalSessions:  number;
  completedCount: number;
  totalCents:     number;
  sessions:       BatchSessionStatus[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCents(cents: number) {
  return `\u20AC${(cents / 100).toFixed(2)}`;
}

async function fetchBatchStatus(batchId: string): Promise<BatchStatus> {
  const res = await fetch(`/api/checkout/batch-status/${batchId}`);
  if (!res.ok) throw new Error("Not found");
  return res.json() as Promise<BatchStatus>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PaymentBatch() {
  const params   = new URLSearchParams(window.location.search);
  const batchId  = params.get("batch_id") ?? "";
  const position = parseInt(params.get("position") ?? "1", 10);

  const [status,    setStatus]    = useState<BatchStatus | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [countdown, setCountdown] = useState(4);
  const [redirecting, setRedirecting] = useState(false);

  // Fetch batch status
  useEffect(() => {
    if (!batchId) { setError("Missing batch ID."); return; }
    fetchBatchStatus(batchId)
      .then(setStatus)
      .catch(() => setError("Could not load payment status. Please return to the app."));
  }, [batchId]);

  const currentSession = status?.sessions.find(s => s.position === position);
  const nextSession    = status?.sessions.find(s => s.position === position + 1 && s.status === "pending");
  const isLast         = !nextSession && status !== null;
  const allComplete    = status?.status === "complete";

  // Countdown to auto-redirect to next payment
  useEffect(() => {
    if (!nextSession?.checkoutUrl || redirecting) return;
    if (countdown <= 0) {
      setRedirecting(true);
      window.location.href = nextSession.checkoutUrl;
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, nextSession, redirecting]);

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#0A1128] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-black text-white mb-3">Something went wrong</h1>
          <p className="text-blue-200/70 text-sm mb-8">{error}</p>
          <a
            href="/"
            className="inline-block bg-amber-400 text-[#0A1128] font-bold px-8 py-3 rounded-xl"
          >
            Return Home
          </a>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!status) {
    return (
      <div className="min-h-screen bg-[#0A1128] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-blue-200/70 text-sm">Loading payment status…</p>
        </div>
      </div>
    );
  }

  // ── Confirmed session details ─────────────────────────────────────────────
  const confirmedSession = currentSession ?? status.sessions.find(s => s.position === position);

  return (
    <div className="min-h-screen bg-[#0A1128] text-white flex flex-col items-center justify-center px-6 py-12">
      {/* Logo + brand */}
      <div className="mb-8 flex items-center gap-2.5">
        <div className="w-9 h-9 bg-amber-400/15 rounded-xl flex items-center justify-center">
          <svg height="20" width="20" viewBox="0 0 36 36" fill="none">
            <path d="M9 18h18M18 10l8 8-8 8" stroke="#D4AF37" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-lg font-bold text-white/90 tracking-wide">Stride</span>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-8">
        <div className="flex justify-between text-xs text-blue-200/60 mb-2">
          <span>Payment {position} of {status.totalSessions}</span>
          <span>{status.completedCount} confirmed</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${(status.completedCount / status.totalSessions) * 100}%` }}
          />
        </div>
        {/* Step dots */}
        <div className="flex justify-center gap-2 mt-3">
          {status.sessions.map(s => (
            <div
              key={s.position}
              className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
                s.status === "complete" ? "bg-emerald-400" :
                s.position === position ? "bg-amber-400" :
                "bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main confirmation card */}
      <div className="w-full max-w-sm">
        {/* Confirmed badge */}
        <div className="flex items-center justify-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-5 py-2 mb-6 mx-auto w-fit">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Payment {position} Confirmed</span>
        </div>

        {/* Checkmark */}
        <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10" fill="none" stroke="white" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-black text-white text-center mb-2">
          {allComplete ? "All Payments Complete!" : `Payment ${position} Confirmed`}
        </h1>
        <p className="text-blue-200/70 text-sm text-center mb-6">
          {confirmedSession?.orgName && `Paid to ${confirmedSession.orgName}`}
          {confirmedSession?.amountCents && ` · ${formatCents(confirmedSession.amountCents)}`}
        </p>

        {/* Invoice chip */}
        {confirmedSession?.invoiceNumber && (
          <div className="bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-center mb-6">
            <p className="text-xs text-blue-200/60 mb-0.5">Invoice Number</p>
            <p className="text-sm font-bold text-amber-400">{confirmedSession.invoiceNumber}</p>
          </div>
        )}

        {/* All complete summary */}
        {allComplete && (
          <div className="bg-white/8 border border-white/10 rounded-2xl p-5 mb-6">
            <p className="text-xs text-blue-200/60 uppercase tracking-wider font-semibold mb-3">All Payments Summary</p>
            {status.sessions.filter(s => s.status === "complete").map(s => (
              <div key={s.position} className="flex items-center justify-between py-2 border-b border-white/8 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-white">{s.orgName ?? `Payment ${s.position}`}</p>
                  {s.invoiceNumber && <p className="text-xs text-blue-200/50">{s.invoiceNumber}</p>}
                </div>
                <p className="text-sm font-bold text-amber-400">{formatCents(s.amountCents)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 mt-1">
              <p className="text-sm font-bold text-white">Total Paid</p>
              <p className="text-lg font-black text-amber-400">{formatCents(status.totalCents)}</p>
            </div>
          </div>
        )}

        {/* Next payment — auto-redirect */}
        {nextSession && !allComplete && (
          <div className="bg-amber-400/10 border border-amber-400/25 rounded-2xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-amber-400 font-black text-sm">{position + 1}</span>
              </div>
              <div className="flex-1">
                <p className="text-xs text-amber-400/80 font-semibold uppercase tracking-wider mb-1">Next Payment</p>
                <p className="text-white font-bold text-sm">{nextSession.orgName ?? `Organisation ${position + 1}`}</p>
                <p className="text-amber-400 font-black text-lg">{formatCents(nextSession.amountCents)}</p>
              </div>
            </div>

            {redirecting ? (
              <div className="mt-4 text-center">
                <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-amber-400/80 text-sm">Opening payment…</p>
              </div>
            ) : (
              <>
                <p className="text-center text-amber-300/70 text-sm mt-4 mb-3">
                  Opening in {countdown}s…
                </p>
                <a
                  href={nextSession.checkoutUrl ?? "#"}
                  className="block w-full text-center bg-amber-400 text-[#0A1128] font-black py-3.5 rounded-xl hover:bg-amber-300 transition-colors"
                  onClick={() => setRedirecting(true)}
                >
                  Pay Now → {nextSession.orgName}
                </a>
                <button
                  className="block w-full text-center text-blue-200/50 text-sm mt-2 py-2"
                  onClick={() => { setCountdown(999); }}
                >
                  Pause auto-redirect
                </button>
              </>
            )}
          </div>
        )}

        {/* Return to app (all done) or return link */}
        <div className="text-center">
          {allComplete ? (
            <>
              <p className="text-blue-200/60 text-sm mb-4">
                All invoices have been saved to your Document Centre in the Stride app.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 bg-white text-[#0A1128] font-bold px-8 py-3.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Return to Stride
              </a>
            </>
          ) : isLast && !nextSession ? (
            <a
              href="/"
              className="text-blue-200/50 text-sm underline-offset-4 hover:text-blue-200/80 underline"
            >
              Return to app
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
