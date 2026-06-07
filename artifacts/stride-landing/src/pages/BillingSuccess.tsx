import { PageShell } from "../components/PageShell";

export default function BillingSuccess() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id") ?? "";

  const features = [
    "Unlimited class sessions and scheduling",
    "Parent portal and Smart Pick-Up",
    "QR kiosk check-in system",
    "Digital documents and e-signatures",
    "Invoicing and automated payment processing",
    "Operator payroll and clock-in ledger",
    "AI-assisted communications and insights",
  ];

  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-[#1E3A8A] border-2 border-[#D4AF37] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#1E3A8A]/40">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              Your organization's subscription is now active. Full platform access has been unlocked. Return to the Stride app to start managing your academy.
            </p>
          </div>

          {/* What's included card */}
          <div className="bg-white/8 border border-white/12 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 pt-5 pb-4 border-b border-white/10">
              <p className="text-blue-300 text-xs font-bold uppercase tracking-wider">What&apos;s now unlocked</p>
            </div>
            <div className="divide-y divide-white/8">
              {features.map(feat => (
                <div key={feat} className="px-6 py-3.5 flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center flex-shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="text-blue-100 text-sm">{feat}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-white/4 flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-blue-400 text-xs">Billing managed securely via Stripe</span>
            </div>
          </div>

          {/* Session reference */}
          {sessionId && (
            <p className="text-center text-blue-500 text-xs font-mono mb-5">
              Subscription ref: {sessionId.slice(-20)}
            </p>
          )}

          {/* CTA */}
          <div className="flex flex-col gap-3">
            <a
              href="stride://"
              className="flex items-center justify-center gap-3 bg-[#D4AF37] text-[#0A192F] font-black text-base py-4 rounded-xl hover:bg-[#e8c44b] transition-colors no-underline"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Open Stride App
            </a>
            <a
              href="/contact"
              className="text-center text-blue-400 text-sm hover:text-blue-200 transition-colors"
            >
              Questions about your subscription? Contact us
            </a>
          </div>

        </div>
      </div>
    </PageShell>
  );
}
