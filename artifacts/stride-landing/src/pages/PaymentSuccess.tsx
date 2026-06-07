import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { BrandingProvider, useBranding } from "../components/BrandingProvider";
import { TrustBadge } from "../components/TrustBadge";

type ReceiptItem = {
  courseName:       string;
  participantName:  string;
  packageType:      string;
  finalPrice:       number;
  organizationName?: string;
};

type Receipt = {
  status:        string;
  invoiceNumber: string | null;
  amountCents:   number | null;
  currency:      string;
  orgName:       string | null;
  branding: {
    primaryColor:   string;
    secondaryColor: string;
    logoUrl:        string | null;
  } | null;
  items: ReceiptItem[];
};

function generateInvoiceHtml(receipt: Receipt, sessionId: string): string {
  const dateStr  = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const sym      = receipt.currency?.toUpperCase() === "GBP" ? "£" : "€";
  const total    = receipt.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : "—";
  const invNum   = receipt.invoiceNumber ?? `REF-${sessionId.slice(-10).toUpperCase()}`;
  const primary  = receipt.branding?.primaryColor   ?? "#1E3A8A";
  const gold     = receipt.branding?.secondaryColor ?? "#D4AF37";
  const orgLabel = receipt.orgName ?? "Stride Platform";
  const ref      = sessionId.slice(-16).toUpperCase();

  const itemRows = receipt.items.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? "#F8FAFC" : "#ffffff"}">
      <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #E5E7EB">${item.courseName}</td>
      <td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #E5E7EB">${item.participantName}</td>
      <td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #E5E7EB">${item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}</td>
      <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:700">${sym}${item.finalPrice.toFixed(2)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invoice ${invNum} — ${orgLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;background:#F1F5F9;padding:40px 20px}
  .page{background:#fff;max-width:700px;margin:auto;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)}
  .hdr{background:${primary};padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
  .hdr-left .org{font-size:20px;font-weight:800;color:#fff;letter-spacing:-.2px}
  .hdr-left .tag{font-size:11px;color:rgba(255,255,255,.6);margin-top:4px;text-transform:uppercase;letter-spacing:.8px}
  .hdr-right{text-align:right}
  .inv-label{font-size:28px;font-weight:900;color:${gold};letter-spacing:-1px}
  .inv-num{font-size:11px;color:rgba(255,255,255,.7);margin-top:2px;font-family:monospace}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:1px solid #E5E7EB}
  .meta-cell{padding:16px 20px;border-right:1px solid #E5E7EB}
  .meta-cell:last-child{border-right:none}
  .mlbl{font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px}
  .mval{font-size:13px;font-weight:700;color:#111827}
  .status-ok{color:#059669}
  table{width:100%;border-collapse:collapse}
  thead th{background:${primary};color:#fff;padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left}
  thead th:last-child{text-align:right}
  .total-row{background:#F8FAFC;border-top:2px solid ${primary}}
  .total-row td{padding:14px 20px;font-size:15px;font-weight:800;color:${primary}}
  .total-row td:last-child{color:${gold};font-size:18px;text-align:right}
  .foot{background:#F8FAFC;border-top:1px solid #E5E7EB;padding:18px 24px;text-align:center}
  .foot p{font-size:11px;color:#9CA3AF;line-height:1.6}
  .foot strong{color:#6B7280}
  @media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0}}
</style>
</head>
<body>
<div class="page">

  <div class="hdr">
    <div class="hdr-left">
      <div class="org">${orgLabel}</div>
      <div class="tag">Official Payment Receipt</div>
    </div>
    <div class="hdr-right">
      <div class="inv-label">INVOICE</div>
      <div class="inv-num">${invNum}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-cell">
      <div class="mlbl">Date Issued</div>
      <div class="mval">${dateStr}</div>
    </div>
    <div class="meta-cell">
      <div class="mlbl">Payment Status</div>
      <div class="mval status-ok">Confirmed ✓</div>
    </div>
    <div class="meta-cell">
      <div class="mlbl">Transaction Ref</div>
      <div class="mval" style="font-family:monospace;font-size:11px">${ref}</div>
    </div>
  </div>

  ${receipt.items.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Course / Activity</th>
        <th>Participant</th>
        <th>Package Type</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="total-row">
        <td colspan="3">Total Paid</td>
        <td>${sym}${total}</td>
      </tr>
    </tbody>
  </table>` : `
  <div style="padding:24px;text-align:center;color:#6B7280;font-size:14px">
    Payment of ${sym}${total} received &mdash; full details available in the Stride app.
  </div>`}

  <div class="foot">
    <p>
      <strong>${orgLabel}</strong> &mdash; Managed by Stride Platform<br/>
      Secure payment processed by Stripe &middot; PCI DSS Level 1 Certified<br/>
      This is an automatically generated receipt. Keep for your records.
    </p>
  </div>

</div>
</body>
</html>`;
}

function InvoiceCard({ receipt, sessionId, loading, attempts }: {
  receipt: Receipt | null;
  sessionId: string;
  loading: boolean;
  attempts: number;
}) {
  const branding = useBranding();
  const sym    = receipt?.currency?.toUpperCase() === "GBP" ? "£" : "€";
  const total  = receipt?.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : null;
  const invNum = receipt?.invoiceNumber ?? (sessionId ? `REF-${sessionId.slice(-10).toUpperCase()}` : null);

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl shadow-black/40 flex flex-col">
      {/* Invoice header bar */}
      <div className="px-7 py-5 flex items-center justify-between" style={{ background: branding.primary }}>
        <div>
          {branding.logo ? (
            <img src={branding.logo} alt={branding.orgName ?? "Organisation"} className="h-8 object-contain rounded" />
          ) : (
            <p className="text-white font-black text-lg tracking-tight">{branding.orgName ?? "Stride Platform"}</p>
          )}
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>Official Payment Receipt</p>
        </div>
        <div className="text-right">
          <p className="font-black text-2xl leading-none" style={{ color: branding.secondary }}>INVOICE</p>
          {invNum && <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>{invNum}</p>}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: branding.secondary, borderTopColor: "transparent" }}
          />
          <p className="text-slate-400 text-sm">
            Loading your receipt{attempts > 0 ? ` (${attempts + 1}/5)` : ""}…
          </p>
        </div>
      ) : (
        <>
          {/* Meta grid */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
            {[
              { label: "Date", value: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) },
              { label: "Status", value: "Confirmed", valueClass: "text-emerald-600 font-black" },
              { label: "Amount", value: total ? `${sym}${total}` : "—", valueStyle: { color: branding.secondary, fontWeight: 800 } },
            ].map(cell => (
              <div key={cell.label} className="px-4 py-3.5">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">{cell.label}</p>
                <p
                  className={`text-slate-900 text-sm font-bold ${cell.valueClass ?? ""}`}
                  style={cell.valueStyle}
                >{cell.value}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          {receipt && receipt.items.length > 0 ? (
            <div className="flex-1 divide-y divide-slate-100">
              {/* Column headers */}
              <div
                className="grid px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ gridTemplateColumns: "1fr auto", color: branding.primary }}
              >
                <span>Course / Participant</span>
                <span>Amount</span>
              </div>
              {receipt.items.map((item, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center justify-between gap-4 bg-white hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 font-semibold text-sm truncate">{item.courseName}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {item.participantName}
                      {" · "}
                      {item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}
                      {item.organizationName ? ` · ${item.organizationName}` : ""}
                    </p>
                  </div>
                  <p className="text-slate-900 font-bold text-sm flex-shrink-0 tabular-nums">
                    {sym}{item.finalPrice.toFixed(2)}
                  </p>
                </div>
              ))}
              {/* Total row */}
              <div className="px-5 py-4 flex items-center justify-between" style={{ background: `${branding.primary}08` }}>
                <p className="font-black text-sm" style={{ color: branding.primary }}>Total Paid</p>
                <p className="font-black text-xl tabular-nums" style={{ color: branding.secondary }}>
                  {sym}{total ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 text-sm">
                {receipt?.status === "pending"
                  ? "Your receipt is being generated. Full details will appear in the Stride app shortly."
                  : total
                  ? `Payment of ${sym}${total} received successfully.`
                  : "Your payment has been received."}
              </p>
            </div>
          )}

          {/* Footer strip */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-slate-400 text-xs">Transaction encrypted · Stripe PCI DSS Level 1</span>
          </div>
        </>
      )}
    </div>
  );
}

function ActionPanel({ receipt, sessionId, onDownload }: {
  receipt: Receipt | null;
  sessionId: string;
  onDownload: () => void;
}) {
  const branding = useBranding();

  const trustPoints = [
    "Your child's spot is secured and confirmed",
    "A receipt has been sent to your registered email",
    "Manage your bookings anytime in the Stride app",
    "All data encrypted and stored securely",
  ];

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "#0f1f4a" }}>
      {/* Top: success badge */}
      <div className="px-6 pt-7 pb-5 text-center border-b border-white/10">
        <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3 py-1 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-300 text-xs font-bold tracking-wider uppercase">Payment Confirmed</span>
        </div>
        <h2 className="text-white font-black text-xl leading-snug">
          Your child&apos;s spot is secured!
        </h2>
        <p className="text-blue-300 text-xs mt-2 leading-relaxed">
          You&apos;re all set. Return to the app to view your full membership details.
        </p>
      </div>

      {/* Trust points */}
      <div className="px-6 py-5 flex-1 space-y-3">
        {trustPoints.map((point, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: `${branding.secondary}22`, border: `1px solid ${branding.secondary}55` }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={branding.secondary} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-blue-100 text-xs leading-relaxed">{point}</p>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className="px-6 pb-6 space-y-3">
        {/* Primary: Download PDF — most prominent */}
        {receipt && receipt.items.length > 0 && (
          <button
            onClick={onDownload}
            className="w-full flex items-center justify-center gap-2.5 font-black text-sm py-3.5 rounded-xl transition-all hover:opacity-90 active:scale-[.98] cursor-pointer border-2"
            style={{ background: branding.secondary, color: branding.primary, borderColor: branding.secondary }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PDF Invoice
          </button>
        )}

        {/* Secondary: Return to App */}
        <a
          href="stride://"
          className="w-full flex items-center justify-center gap-2.5 text-white font-bold text-sm py-3.5 rounded-xl border border-white/20 hover:bg-white/10 transition-colors no-underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Open Stride App
        </a>

        {sessionId && (
          <p className="text-center text-blue-500 text-[10px] font-mono pt-1">
            Ref: {sessionId.slice(-20).toUpperCase()}
          </p>
        )}
      </div>

      {/* Trust badge */}
      <div className="border-t border-white/8 px-6 py-3">
        <TrustBadge />
      </div>
    </div>
  );
}

export default function PaymentSuccess() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") ?? "";

  const [receipt,  setReceipt]  = useState<Receipt | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/checkout/receipt/${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const data = await res.json() as Receipt;
          if (!cancelled) { setReceipt(data); setLoading(false); }
        } else {
          if (!cancelled) setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void poll();
    const timer = setInterval(() => {
      setAttempts(a => {
        if (a >= 4) { clearInterval(timer); return a; }
        void poll();
        return a + 1;
      });
    }, 3000);

    return () => { cancelled = true; clearInterval(timer); };
  }, [sessionId]);

  const branding = receipt?.branding ? {
    primary:   receipt.branding.primaryColor,
    secondary: receipt.branding.secondaryColor,
    logo:      receipt.branding.logoUrl,
    orgName:   receipt.orgName,
  } : null;

  const handleDownload = () => {
    if (!receipt) return;
    const html = generateInvoiceHtml({ ...receipt, currency: receipt.currency ?? "EUR" }, sessionId);
    const win  = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <BrandingProvider branding={branding}>
      <PageShell dark>
        <div className="min-h-[80vh] px-4 py-10 sm:py-14">
          <div className="max-w-4xl mx-auto">

            {/* Page header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">Booking Confirmed</h1>
              <p className="text-blue-300 text-sm">
                Everything went through smoothly. Keep this page as your reference.
              </p>
            </div>

            {/* Two-column layout on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_0.85fr] gap-5 items-start">
              <InvoiceCard
                receipt={receipt}
                sessionId={sessionId}
                loading={loading}
                attempts={attempts}
              />
              <ActionPanel
                receipt={receipt}
                sessionId={sessionId}
                onDownload={handleDownload}
              />
            </div>

            {/* Bottom note */}
            <p className="text-center text-blue-500 text-xs mt-6">
              If the app doesn&apos;t open automatically, switch back to Stride manually.
              Questions? <a href="/contact" className="text-blue-300 hover:text-white transition-colors">Contact our support team.</a>
            </p>

          </div>
        </div>
      </PageShell>
    </BrandingProvider>
  );
}
