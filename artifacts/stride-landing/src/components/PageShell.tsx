import { TrustBadge } from "./TrustBadge";

interface PageShellProps {
  children: React.ReactNode;
  dark?: boolean;
}

export function PageShell({ children, dark = false }: PageShellProps) {
  const navBg   = dark ? "bg-[#0d1a3e] border-white/10" : "bg-white border-slate-100";
  const logoTxt = dark ? "text-white" : "text-[#1E3A8A]";
  const linkTxt = dark ? "text-blue-200 hover:text-white" : "text-slate-500 hover:text-[#1E3A8A]";

  return (
    <div
      className={`min-h-screen flex flex-col ${dark ? "bg-[#0a1225]" : "bg-[#F8FAFC]"}`}
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* ── Nav ── */}
      <nav className={`sticky top-0 z-50 border-b shadow-sm ${navBg}`}>
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <svg height="26" width="26" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="9" fill="#1E3A8A" />
              <path d="M9 18h18M18 10l8 8-8 8" stroke={dark ? "#D4AF37" : "white"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`text-base font-bold tracking-wide ${logoTxt}`}>Stride</span>
          </a>
          <div className="flex items-center gap-5">
            <a href="/about"   className={`text-sm font-medium transition-colors hidden sm:block ${linkTxt}`}>About</a>
            <a href="/pricing" className={`text-sm font-medium transition-colors hidden sm:block ${linkTxt}`}>Pricing</a>
            <a href="/faq"     className={`text-sm font-medium transition-colors hidden sm:block ${linkTxt}`}>FAQ</a>
            <a href="/contact" className={`text-sm font-medium transition-colors ${linkTxt}`}>Support</a>
            <a href="/register" className="bg-[#D4AF37] text-[#0A192F] text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-[#e8c44b] transition-colors no-underline">
              Get Started
            </a>
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="flex-1">{children}</main>

      {/* ── Footer ── */}
      <footer className="bg-[#0d1a3e]">
        {/* Trust strip — visible on every page */}
        <div className="border-b border-white/8 py-4">
          <TrustBadge className="max-w-5xl mx-auto px-5" />
        </div>

        {/* Links grid */}
        <div className="max-w-5xl mx-auto px-5 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 border-b border-white/8">
          <div>
            <a href="/" className="flex items-center gap-2 no-underline mb-3">
              <svg height="22" width="22" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="9" fill="white" fillOpacity="0.1" />
                <path d="M9 18h18M18 10l8 8-8 8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold text-white text-sm">Stride</span>
            </a>
            <p className="text-blue-400 text-xs leading-relaxed">
              Activity management for the modern school.
            </p>
          </div>

          <div>
            <p className="text-white text-xs font-black uppercase tracking-wider mb-3">Product</p>
            <div className="flex flex-col gap-2">
              <a href="/pricing" className="text-blue-300 text-xs hover:text-white transition-colors">Pricing</a>
              <a href="/about"   className="text-blue-300 text-xs hover:text-white transition-colors">About</a>
              <a href="/faq"     className="text-blue-300 text-xs hover:text-white transition-colors">FAQ</a>
            </div>
          </div>

          <div>
            <p className="text-white text-xs font-black uppercase tracking-wider mb-3">Support</p>
            <div className="flex flex-col gap-2">
              <a href="/contact" className="text-blue-300 text-xs hover:text-white transition-colors">Contact Us</a>
              <a href="/register" className="text-blue-300 text-xs hover:text-white transition-colors">Get Started</a>
            </div>
          </div>

          <div>
            <p className="text-white text-xs font-black uppercase tracking-wider mb-3">Legal</p>
            <div className="flex flex-col gap-2">
              <a href="/privacy" className="text-blue-300 text-xs hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms"   className="text-blue-300 text-xs hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="max-w-5xl mx-auto px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-blue-400 text-xs">
            &copy; {new Date().getFullYear()} Stride Platform &mdash; All transactions encrypted by Stripe.
          </span>
          <span className="text-blue-400 text-xs">🇪🇺 Data stored in the EU</span>
        </div>
      </footer>
    </div>
  );
}
