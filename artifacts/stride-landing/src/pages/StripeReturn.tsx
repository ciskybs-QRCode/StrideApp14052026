import { PageShell } from "../components/PageShell";

export default function StripeReturn() {
  const steps = [
    { title: "Open the Stride app", desc: "Switch back to the Stride app on your device." },
    { title: "Check Operator Settings", desc: "Go to your profile and open the Payroll & Payments section." },
    { title: "Verify your payout account", desc: "Confirm your Stripe Express account shows as 'Connected'." },
    { title: "Receive payouts", desc: "Earnings will be transferred to your bank account on the agreed schedule." },
  ];

  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
                <polyline points="7 15 9 17 13 13" />
              </svg>
            </div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-4 py-1.5 mb-5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 text-xs font-bold tracking-wider uppercase">Stripe Connect Setup Complete</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Payout Account Configured!
            </h1>
            <p className="text-blue-200 text-base leading-relaxed">
              Your Stripe Express account has been set up. You can now receive payouts directly to your bank account for sessions and services provided through Stride.
            </p>
          </div>

          {/* What was set up */}
          <div className="bg-white/8 border border-white/12 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 pt-5 pb-4 border-b border-white/10 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#D4AF37]/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-white font-bold text-sm">What&apos;s been configured</p>
            </div>
            <div className="divide-y divide-white/8">
              {[
                "Stripe Express account linked to your Stride profile",
                "Payout currency and bank account details captured",
                "Identity verification submitted to Stripe",
                "Automatic payment routing enabled for your sessions",
              ].map(item => (
                <div key={item} className="px-6 py-3.5 flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <p className="text-blue-100 text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Next steps */}
          <div className="bg-white/4 border border-white/8 rounded-2xl p-5 mb-6">
            <p className="text-blue-300 text-xs font-bold uppercase tracking-wider mb-4">Next steps</p>
            <div className="space-y-4">
              {steps.map((step, i) => (
                <div key={step.title} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#1E3A8A] border border-[#D4AF37]/40 flex items-center justify-center flex-shrink-0 text-[#D4AF37] text-xs font-black">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-white text-sm font-semibold">{step.title}</p>
                    <p className="text-blue-300 text-xs mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-amber-200 text-xs leading-relaxed">
                Stripe may require additional verification documents before your first payout is released. Check your email for any requests from Stripe.
              </p>
            </div>
          </div>

          {/* CTA */}
          <a
            href="stride://"
            className="flex items-center justify-center gap-3 bg-[#D4AF37] text-[#0A192F] font-black text-base py-4 rounded-xl hover:bg-[#e8c44b] transition-colors no-underline"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Return to Stride App
          </a>

        </div>
      </div>
    </PageShell>
  );
}
