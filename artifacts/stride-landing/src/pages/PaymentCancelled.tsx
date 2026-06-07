import { PageShell } from "../components/PageShell";

export default function PaymentCancelled() {
  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">

          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-slate-600 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>

          <div className="inline-flex items-center gap-2 bg-slate-600/40 border border-slate-500/30 rounded-full px-4 py-1.5 mb-5">
            <span className="text-slate-300 text-xs font-bold tracking-wider uppercase">Payment Cancelled</span>
          </div>

          <h1 className="text-3xl font-black text-white mb-3">No charge was made</h1>
          <p className="text-blue-200 text-base leading-relaxed mb-8">
            You cancelled the payment process. Your card was not charged. You can return to the Stride app and try again whenever you're ready.
          </p>

          <div className="bg-white/6 border border-white/10 rounded-2xl p-5 mb-8 text-left space-y-3">
            {[
              "No payment was taken",
              "Your cart items are still saved in the app",
              "You can retry checkout at any time",
            ].map(msg => (
              <div key={msg} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-blue-100 text-sm">{msg}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <a
              href="stride://"
              className="flex items-center justify-center gap-3 bg-[#1E3A8A] border border-white/20 text-white font-bold text-base py-4 rounded-xl hover:bg-[#2a4fa0] transition-colors no-underline"
            >
              Back to Stride App
            </a>
            <a
              href="/contact"
              className="text-blue-300 text-sm hover:text-white transition-colors"
            >
              Need help? Contact support
            </a>
          </div>

        </div>
      </div>
    </PageShell>
  );
}
