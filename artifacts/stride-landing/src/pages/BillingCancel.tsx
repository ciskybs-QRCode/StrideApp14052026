import { PageShell } from "../components/PageShell";
import { TrustBadge } from "../components/TrustBadge";

export default function BillingCancel() {
  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">

          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/40 flex items-center justify-center mx-auto mb-6">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-full px-4 py-1.5 mb-5">
            <span className="text-amber-300 text-xs font-bold tracking-wider uppercase">Subscription Not Yet Active</span>
          </div>

          <h1 className="text-3xl font-black text-white mb-3">No worries — no charge made</h1>
          <p className="text-blue-200 text-base leading-relaxed mb-8">
            You left before completing the subscription setup. Your account data is completely safe
            and nothing was billed. You can activate your plan at any point — Stride will be waiting for you.
          </p>

          <div className="bg-white/6 border border-white/10 rounded-2xl p-5 mb-8 text-left">
            <p className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-4">What to do next</p>
            <div className="space-y-4">
              {[
                {
                  title: "Return to the app to try again",
                  desc:  "Open Admin Settings then tap Subscription & Billing to restart checkout.",
                },
                {
                  title: "Your free trial may still be running",
                  desc:  "If your trial hasn't expired, you can continue using Stride at no cost.",
                },
                {
                  title: "Talk to our team",
                  desc:  "We can walk you through activation and answer any pricing questions.",
                },
              ].map(step => (
                <div key={step.title} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] flex-shrink-0 mt-1.5" />
                  <div>
                    <p className="text-white text-sm font-semibold">{step.title}</p>
                    <p className="text-blue-300 text-xs mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-8">
            <a
              href="stride://"
              className="flex items-center justify-center gap-2.5 bg-[#D4AF37] text-[#0A192F] font-black text-base py-4 rounded-xl hover:bg-[#e8c44b] transition-colors no-underline"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Back to Stride App
            </a>
            <a
              href="/contact"
              className="flex items-center justify-center gap-2.5 bg-white/8 border border-white/15 text-blue-200 font-semibold text-sm py-3.5 rounded-xl hover:bg-white/12 transition-colors no-underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Contact Support
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
