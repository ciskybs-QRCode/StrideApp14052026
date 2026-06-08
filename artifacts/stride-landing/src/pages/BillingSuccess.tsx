import { PageShell } from "../components/PageShell";
import { TrustBadge } from "../components/TrustBadge";

export default function BillingSuccess() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") ?? "";

  const features = [
    { icon: "📅", label: "Unlimited class scheduling and calendar management" },
    { icon: "👪", label: "Member portal with Smart Pick-Up and real-time updates" },
    { icon: "📲", label: "QR kiosk check-in and operator clock-in system" },
    { icon: "📝", label: "Digital document signing and compliance records" },
    { icon: "💳", label: "Automated invoicing and payment processing for members" },
    { icon: "💼", label: "Operator payroll ledger and earnings dashboard" },
    { icon: "🤖", label: "AI-assisted communications and operational insights" },
  ];

  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-[#1E3A8A] border-2 border-[#D4AF37] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#1E3A8A]/40">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div className="inline-flex items-center gap-2 bg-[#D4AF37]/15 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-5">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
              <span className="text-[#D4AF37] text-xs font-bold tracking-wider uppercase">Subscription Active</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Welcome to Stride!
            </h1>
            <p className="text-blue-200 text-base leading-relaxed">
              Your subscription is live and your academy is ready to run.
              Every tool you need to manage memberships, payments, and communications is now unlocked.
            </p>
          </div>

          {/* What's unlocked card */}
          <div className="bg-white/8 border border-white/12 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-white/10">
              <p className="text-blue-300 text-xs font-bold uppercase tracking-wider">Everything that&apos;s now unlocked</p>
            </div>
            <div className="divide-y divide-white/8">
              {features.map(feat => (
                <div key={feat.label} className="px-5 py-3.5 flex items-center gap-3.5">
                  <span className="text-base flex-shrink-0 w-6 text-center">{feat.icon}</span>
                  <p className="text-blue-100 text-sm leading-snug">{feat.label}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-white/4 flex items-center justify-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-blue-400 text-xs">Billing managed securely through Stripe. Cancel anytime.</span>
            </div>
          </div>

          {sessionId && (
            <p className="text-center text-blue-500 text-xs font-mono mb-5">
              Subscription ref: {sessionId.slice(-20).toUpperCase()}
            </p>
          )}

          {/* CTA */}
          <div className="flex flex-col gap-3 mb-8">
            <a
              href="stride://"
              className="flex items-center justify-center gap-2.5 bg-[#D4AF37] text-[#0A192F] font-black text-base py-4 rounded-xl hover:bg-[#e8c44b] transition-colors no-underline"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Open Stride &amp; Start Managing
            </a>
            <a
              href="/contact"
              className="text-center text-blue-400 text-sm hover:text-blue-200 transition-colors"
            >
              Questions about your subscription? We&apos;re here to help.
            </a>
          </div>

          <div className="border-t border-white/10 pt-6">
            <TrustBadge />
          </div>

        </div>
      </div>
    </PageShell>
  );
}
