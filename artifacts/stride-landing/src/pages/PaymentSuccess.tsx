import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";

type ReceiptItem = {
  courseName:       string;
  participantName:  string;
  packageType:      string;
  finalPrice:       number;
  organizationName?: string;
};

type Branding = {
  primaryColor:   string;
  secondaryColor: string;
  logoUrl:        string | null;
};

type Receipt = {
  status:        string;
  invoiceNumber: string | null;
  amountCents:   number | null;
  currency:      string;
  orgName:       string | null;
  branding:      Branding | null;
  items:         ReceiptItem[];
};

function generateReceiptHtml(receipt: Receipt, sessionId: string): string {
  const dateStr  = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const total    = receipt.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : "—";
  const sym      = receipt.currency?.toUpperCase() === "GBP" ? "£" : "€";
  const invNum   = receipt.invoiceNumber ?? `REF-${sessionId.slice(-10).toUpperCase()}`;
  const primary   = receipt.branding?.primaryColor   ?? "#1E3A8A";
  const secondary = receipt.branding?.secondaryColor ?? "#D4AF37";
  const orgLabel  = receipt.orgName ?? "Stride Platform";

  const rows = receipt.items.map(item =>
    `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${item.courseName}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${item.participantName}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${item.organizationName ?? orgLabel}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151">${item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#374151;text-align:right">${sym}${item.finalPrice.toFixed(2)}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Receipt ${invNum}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:${primary};max-width:720px;margin:auto}
.header{border-bottom:3px solid ${secondary};padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
.org{font-size:22px;font-weight:800}.sub{font-size:12px;color:#6B7280;margin-top:4px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.lbl{font-size:10px;color:#9CA3AF;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
.val{font-size:14px;font-weight:700;color:#111827}
table{width:100%;border-collapse:collapse}th{background:${primary};color:#fff;padding:10px 12px;text-align:left;font-size:12px;font-weight:700}
.tot{margin-top:20px;text-align:right;font-size:18px;font-weight:800;color:${primary}}
.accent{color:${secondary}}
.foot{margin-top:40px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:16px}
@media print{body{padding:20px}}</style></head>
<body>
<div class="header">
  <div>
    <div class="org">${orgLabel}</div>
    <div class="sub">Official Payment Receipt</div>
  </div>
  <svg height="36" width="36" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="9" fill="${primary}"/><path d="M9 18h18M18 10l8 8-8 8" stroke="${secondary}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
</div>
<div class="meta">
  <div><div class="lbl">Invoice Number</div><div class="val">${invNum}</div></div>
  <div><div class="lbl">Date</div><div class="val">${dateStr}</div></div>
  <div><div class="lbl">Payment Status</div><div class="val" style="color:#059669">Confirmed &#10003;</div></div>
  <div><div class="lbl">Reference</div><div class="val" style="font-size:11px;font-family:monospace">${sessionId.slice(-16)}</div></div>
</div>
${rows
  ? `<table><thead><tr>
      <th>Course / Activity</th>
      <th>Child / Participant</th>
      <th>Provider</th>
      <th>Package</th>
      <th style="text-align:right">Amount</th>
    </tr></thead><tbody>${rows}</tbody></table>`
  : ""}
<div class="tot">Total Paid: <span class="accent">${sym}${total}</span></div>
<div class="foot">${orgLabel} &mdash; Secure payments powered by Stripe &mdash; Automatically generated receipt</div>
</body></html>`;
}

export default function PaymentSuccess() {
  const sessionId  = new URLSearchParams(window.location.search).get("session_id") ?? "";
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
          if (!cancelled) {
            setReceipt(data);
            // Stop polling once we have a non-pending status
            if (data.status !== "pending") setLoading(false);
            else setLoading(false);
          }
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

  const total   = receipt?.amountCents != null ? (receipt.amountCents / 100).toFixed(2) : null;
  const sym     = receipt?.currency?.toUpperCase() === "GBP" ? "£" : "€";
  const invNum  = receipt?.invoiceNumber ?? (sessionId ? `REF-${sessionId.slice(-10).toUpperCase()}` : null);
  const orgName = receipt?.orgName ?? null;

  // Dynamic branding — use org's colours when available
  const primary   = receipt?.branding?.primaryColor   ?? "#1E3A8A";
  const secondary = receipt?.branding?.secondaryColor ?? "#D4AF37";
  const logoUrl   = receipt?.branding?.logoUrl        ?? null;

  const handleDownload = () => {
    if (!receipt) return;
    const html = generateReceiptHtml({ ...receipt, currency: receipt.currency ?? "EUR" }, sessionId);
    const win  = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

          {/* Success header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold tracking-wider uppercase">Payment Confirmed</span>
            </div>

            {/* Org logo or name */}
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={orgName ?? "Organisation"}
                className="h-10 mx-auto mb-3 object-contain rounded"
              />
            ) : orgName ? (
              <p
                className="text-sm font-bold mb-3 tracking-wide"
                style={{ color: secondary }}
              >
                {orgName}
              </p>
            ) : null}

            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Your booking is locked in!</h1>
            <p className="text-blue-200 text-base leading-relaxed">
              The payment has been processed securely through Stripe. Return to the Stride app to view your full confirmation and invoice.
            </p>
          </div>

          {/* Receipt card — accent border uses org's secondary colour */}
          <div
            className="bg-white/8 rounded-2xl overflow-hidden mb-6 border"
            style={{ borderColor: `${secondary}40` }}
          >
            {loading ? (
              <div className="p-10 text-center">
                <div
                  className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                  style={{ borderColor: secondary, borderTopColor: "transparent" }}
                />
                <p className="text-blue-300 text-sm">Loading your receipt{attempts > 0 ? ` (attempt ${attempts + 1})` : ""}…</p>
              </div>
            ) : (
              <>
                {/* Invoice meta */}
                <div className="px-6 pt-6 pb-4 border-b border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">Invoice</p>
                      <p className="text-white font-bold text-lg font-mono">{invNum ?? "Pending…"}</p>
                      {orgName && (
                        <p className="text-xs mt-1" style={{ color: secondary }}>{orgName}</p>
                      )}
                    </div>
                    {total && (
                      <div className="text-right">
                        <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">Total Paid</p>
                        <p className="font-black text-2xl" style={{ color: secondary }}>{sym}{total}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Line items — child name + provider per row */}
                {receipt && receipt.items.length > 0 ? (
                  <div className="divide-y divide-white/8">
                    {receipt.items.map((item, i) => (
                      <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm truncate">{item.courseName}</p>
                          <p className="text-blue-300 text-xs mt-0.5">
                            {item.participantName}
                            {item.organizationName
                              ? ` · ${item.organizationName}`
                              : orgName
                              ? ` · ${orgName}`
                              : ""}
                            {" · "}
                            {item.packageType === "fixedBlock" ? "Full Package" : "Single Lesson"}
                          </p>
                        </div>
                        <p className="text-white font-bold text-sm flex-shrink-0">{sym}{item.finalPrice.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-6 py-4">
                    <p className="text-blue-400 text-sm text-center">
                      {receipt?.status === "pending"
                        ? "Receipt details are being processed. Return to the app for your full confirmation."
                        : "Your payment has been received."}
                    </p>
                  </div>
                )}

                {/* Secure badge */}
                <div className="px-6 py-3 bg-white/4 flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span className="text-blue-400 text-xs">Secured by Stripe · PCI DSS Level 1 Certified</span>
                </div>
              </>
            )}
          </div>

          {/* Session reference */}
          {sessionId && (
            <p className="text-center text-blue-500 text-xs font-mono mb-6">
              Ref: {sessionId.slice(-20)}
            </p>
          )}

          {/* CTA buttons — primary button uses org's secondary colour */}
          <div className="flex flex-col gap-3">
            <a
              href="stride://"
              className="flex items-center justify-center gap-3 font-black text-base py-4 rounded-xl transition-colors no-underline"
              style={{ backgroundColor: secondary, color: primary }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Return to Stride App
            </a>

            {receipt && receipt.items.length > 0 && (
              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-3 bg-white/10 border border-white/20 text-white font-semibold text-sm py-3.5 rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download Receipt (PDF)
              </button>
            )}

            <p className="text-center text-blue-400 text-xs mt-1">
              If the app doesn&apos;t open automatically, switch back to Stride manually.
            </p>
          </div>

        </div>
      </div>
    </PageShell>
  );
}
