import { PageShell } from "../components/PageShell";
import { TrustBadge } from "../components/TrustBadge";

export default function PaymentCancelled() {
  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">

          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center mx-auto mb-6">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>

          <div className="inline-flex items-center gap-2 bg-slate-600/30 border border-slate-500/30 rounded-full px-4 py-1.5 mb-5">
            <span className="text-slate-300 text-xs font-bold tracking-wider uppercase">Payment Not Completed</span>
          </div>

          <h1 className="text-3xl font-black text-white mb-3">No charge was made</h1>
          <p className="text-blue-200 text-base leading-relaxed mb-8">
            You left before completing the payment — and that&apos;s completely fine.
            Your card was not charged, and your child&apos;s place is still available.
            Head back to the Stride app whenever you&apos;re ready.
          </p>

          {/* Reassurance card */}
          <div className="bg-white/6 border border-white/10 rounded-2xl p-5 mb-8 text-left space-y-4">
            <p className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">What you should know</p>
            {[
              { icon: "✓", text: "Your card was not charged — no payment was taken" },
              { icon: "✓", text: "Your cart is still saved in the Stride app" },
              { icon: "✓", text: "You can complete checkout at any time, at your own pace" },
              { icon: "✓", text: "Spots are subject to availability — act soon to secure your place" },
            ].map(item => (
              <div key={item.text} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-blue-100 text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3 mb-8">
            <a
              href="stride://"
              className="flex items-center justify-center gap-2.5 bg-[#1E3A8A] border border-[#D4AF37]/40 text-white font-black text-base py-4 rounded-xl hover:bg-[#2a4fa0] transition-colors no-underline"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Return to Stride App
            </a>
            <a
              href="/contact"
              className="text-blue-300 text-sm hover:text-white transition-colors py-1"
            >
              Need assistance? Our support team is here to help.
            </a>
          </div>

          {/* Trust badge */}
          <div className="border-t border-white/10 pt-6">
            <TrustBadge />
          </div>

        </div>
      </div>
    </PageShell>
  );
}
