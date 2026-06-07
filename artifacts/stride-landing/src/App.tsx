import { useState, useEffect, useRef } from "react";
import { Router, Route, Switch } from "wouter";
import Register from "./pages/Register";
import Activate from "./pages/Activate";
import PaymentSuccessPage  from "./pages/PaymentSuccess";
import PaymentCancelledPage from "./pages/PaymentCancelled";
import PaymentBatchPage     from "./pages/PaymentBatch";
import BillingSuccessPage  from "./pages/BillingSuccess";
import BillingCancelPage   from "./pages/BillingCancel";
import StripeReturnPage    from "./pages/StripeReturn";
import TermsPage           from "./pages/Terms";
import PrivacyPage         from "./pages/Privacy";
import ContactPage         from "./pages/Contact";

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconEye = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconBrain = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  </svg>
);

const IconBolt = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);

const IconQR = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
  </svg>
);

const IconShield = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const IconBell = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);

const IconCard = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const IconArrow = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const Logo = () => (
  <svg height="32" width="32" viewBox="0 0 36 36" fill="none" aria-hidden>
    <rect width="36" height="36" rx="9" fill="#1E3A8A" fillOpacity="0.12" />
    <path d="M9 18h18M18 10l8 8-8 8" stroke="#1E3A8A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Data ─────────────────────────────────────────────────────────────────────

const AI_CORES = [
  {
    Icon: IconEye,
    tag: "Vision AI",
    title: "Document Reader",
    desc: "Parents snap a photo of medical certificates or legal waivers. Our Vision AI extracts expiration dates, validates signatures, and updates profiles instantly — zero manual review.",
    color: "bg-blue-50 text-blue-700 border-blue-100",
    iconBg: "bg-blue-600",
  },
  {
    Icon: IconBrain,
    tag: "Predictive Engine",
    title: "Smart Rostering",
    desc: "When an instructor schedules an absence, the AI analyzes historical records and notifies the best pre-verified substitute in seconds. No last-minute panic.",
    color: "bg-amber-50 text-amber-700 border-amber-100",
    iconBg: "bg-amber-500",
  },
  {
    Icon: IconBolt,
    tag: "Stripe Connect",
    title: "Real-Time Payouts",
    desc: "1-click automated payroll. Pay instructors and operators instantly via secure platform routing. Absolute transparency, zero administrative friction.",
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    iconBg: "bg-emerald-600",
  },
];

const PILLARS = [
  {
    Icon: IconQR,
    title: "Kiosk Check-In",
    tag: "Smart Attendance",
    desc: "Drop an iPad at the door. Members scan their QR code, instantly marking attendance. Secure, tamper-proof, and real-time.",
    iconBg: "bg-blue-600",
  },
  {
    Icon: IconShield,
    title: "Legal Gate",
    tag: "Zero-Liability",
    desc: "Digital signature compliance for terms, privacy policies, and media releases — enforced on the parent's phone before first access.",
    iconBg: "bg-indigo-600",
  },
  {
    Icon: IconBell,
    title: "Substitution Cascade",
    tag: "Auto-Dispatch",
    desc: "Absence reported → 5-minute rolling notification cascade to qualified backup staff. Slot filled, admin not bothered.",
    iconBg: "bg-violet-600",
  },
  {
    Icon: IconCard,
    title: "Stripe Connect Direct",
    tag: "0% Platform Fee",
    desc: "Member fees land directly into your school's balance. Zero platform commission during your entire trial period.",
    iconBg: "bg-amber-500",
  },
];

const PAIN_POINTS = [
  { emoji: "📋", title: "Attendance Chaos", desc: "Lost logbooks, endless roll calls, sessions starting late while the teacher hunts for the clipboard." },
  { emoji: "💸", title: "Payroll Nightmares", desc: "Hours wasted matching hours, absences, and last-minute covers. One mistake and trust breaks down overnight." },
  { emoji: "⚖️", title: "Untracked Liability", desc: "Waivers and consents left unsigned, exposing your organisation to compliance risks and potential litigation." },
  { emoji: "🔗", title: "SaaS Middlemen", desc: "Fixed monthly contracts and percentage cuts on member fees — every single month, regardless of performance." },
];

const COMPLIANCE_REGIONS = [
  { flag: "🇦🇺", label: "AU Non-Profit", sub: "WA Cultural Associations", detail: "NFP-compliant invoicing, volunteer roles, and state-level data residency for WA regulations.", currency: "AUD" },
  { flag: "🇦🇺", label: "AU Commercial", sub: "ABN Studios & Gyms", detail: "Full ABN framework, GST-inclusive pricing, and TFND withholding automation for contractors.", currency: "AUD" },
  { flag: "🇪🇺", label: "EU Sportive", sub: "ASD / SSD Legal Entities", detail: "GDPR-native data handling, EUR billing, and compliance scaffolding for Italian and European ASD/SSD structures.", currency: "EUR" },
];

const FAQS = [
  { q: "Do I need a credit card to start the trial?", a: "No. Complete and unrestricted access for 30 days, no strings attached. Your account activates instantly with zero payment details required." },
  { q: "What if an entrance kiosk tablet gets stolen?", a: "Use Revoke Access from your operator phone to force-logout and lock the device remotely. The tablet loses all session access within seconds." },
  { q: "Can I manage multiple venues or classes?", a: "Yes, multi-location architecture is natively supported. Create separate schedules, staff pools, and attendance trackers per venue under one admin account." },
  { q: "How does QR-code pricing work?", a: "You pay per active QR code each month. Each member, dependent, admin account, and kiosk terminal counts as one billable QR. Volume discounts apply automatically: $1.20 for the first 100, $1.05 up to 300, and $0.90 above that. Authorized pick-up contacts are always free of charge. No flat fees, no minimums." },
  { q: "Is my members' data private and secure?", a: "Each school's data is in a fully isolated tenant environment. Cross-tenant access is architecturally impossible. All traffic is encrypted in transit and at rest." },
];

const SAFETY_PILLARS = [
  { label: "Protocol Adherence", value: 38, max: 40, color: "bg-blue-400", barColor: "#60A5FA", desc: "On-time sign-ins, pickup compliance, session punctuality" },
  { label: "Parent Feedback",    value: 37, max: 40, color: "bg-emerald-400", barColor: "#34D399", desc: "Safety & communication ratings from enrolled families" },
  { label: "Emergency Response", value: 20, max: 20, color: "bg-violet-400", barColor: "#A78BFA", desc: "Documented handoffs and incident resolution speed" },
];

const FEATURED_SCHOOLS = [
  { name: "Elite Dance Academy",   location: "Sydney, AU",  score: 95, isVerified: true,  reviews: 127, discipline: "Ballet & Contemporary" },
  { name: "ArtMotion Studio",      location: "Melbourne, AU", score: 88, isVerified: true, reviews: 84,  discipline: "Jazz & Hip-Hop" },
  { name: "Prestige Ballet",       location: "Milan, IT",   score: 91, isVerified: true,  reviews: 203, discipline: "Classical Ballet" },
  { name: "ActiveKids Academy",    location: "Brisbane, AU", score: 76, isVerified: false, reviews: 31,  discipline: "Multi-sport" },
  { name: "Sydney Stars SC",       location: "Sydney, AU",  score: 82, isVerified: false, reviews: 56,  discipline: "Gymnastics" },
  { name: "PureMotion Institute",  location: "Rome, IT",    score: 93, isVerified: true,  reviews: 149, discipline: "Dance & Fitness" },
];

// ── Landing ───────────────────────────────────────────────────────────────────

type FeedEntry = { event: string; timestamp: string; school: string };

function useAnimatedCount(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setCount(Math.round(p * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return count;
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrCodes, setQrCodes] = useState(50);
  const [currency, setCurrency] = useState<"USD" | "AUD" | "EUR">("USD");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [liveFeed, setLiveFeed] = useState<FeedEntry[]>([]);
  const scoreDisplay = useAnimatedCount(95, 1400);

  useEffect(() => {
    fetch("/api/public/activity-feed")
      .then(r => r.json())
      .then((d: { feed: FeedEntry[] }) => { if (d.feed?.length) setLiveFeed(d.feed); })
      .catch(() => {});
  }, []);

  const FX:  Record<"USD" | "AUD" | "EUR", number> = { USD: 1, AUD: 1.55, EUR: 0.93 };
  const SYM: Record<"USD" | "AUD" | "EUR", string> = { USD: "$", AUD: "A$", EUR: "\u20AC" };
  const symbol = SYM[currency];
  const fx = FX[currency];
  const calcQRBill = (qr: number): number => {
    if (qr <= 0) return 0;
    let total = 0;
    let rem = qr;
    if (rem > 0) { const u = Math.min(rem, 100); total += u * 1.20 * fx; rem -= u; }
    if (rem > 0) { const u = Math.min(rem, 200); total += u * 1.05 * fx; rem -= u; }
    if (rem > 0) { total += rem * 0.90 * fx; }
    return Math.round(total * 100) / 100;
  };
  const monthlyTotal = calcQRBill(qrCodes).toFixed(2);
  const perQRRate = qrCodes > 0 ? (calcQRBill(qrCodes) / qrCodes).toFixed(3) : "0.000";
  const flatCost = qrCodes * 1.20 * fx;
  const volumeSavings = qrCodes > 100 ? Math.max(0, flatCost - calcQRBill(qrCodes)).toFixed(2) : null;

  return (
    <div className="bg-white text-slate-900 min-h-screen overflow-x-hidden font-sans">

      {/* ── NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <Logo />
            <span className="text-base font-bold text-[#1E3A8A] tracking-wide">Stride</span>
            <span className="hidden sm:inline text-slate-400 text-sm font-normal">Platform</span>
          </a>

          <div className="hidden md:flex items-center gap-7">
            {[["#pain-points", "Why Us"], ["#ai-cores", "AI Cores"], ["#how-it-works", "How It Works"], ["#features", "Features"], ["#pricing", "Pricing"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={label} href={href} className="text-sm text-slate-600 hover:text-[#1E3A8A] font-medium transition-colors">{label}</a>
            ))}
            <a href="/register"
              className="bg-[#1E3A8A] text-white text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-[#1e3070] transition-colors">
              Get Started
            </a>
          </div>

          <button className="md:hidden text-slate-500 p-1" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-6 py-5 flex flex-col gap-4 shadow-lg">
            {[["#pain-points", "Why Us"], ["#ai-cores", "AI Cores"], ["#how-it-works", "How It Works"], ["#features", "Features"], ["#pricing", "Pricing"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={label} href={href} className="text-sm text-slate-600 hover:text-[#1E3A8A] font-medium"
                onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <a href="/register"
              className="bg-[#1E3A8A] text-white text-sm font-bold px-5 py-3 rounded-lg text-center"
              onClick={() => setMenuOpen(false)}>
              Get Started / Schedule Pilot
            </a>
          </div>
        )}
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24">
        <div className="flex flex-col-reverse lg:flex-row items-center gap-14 lg:gap-20">

          <div className="flex-1 w-full text-center lg:text-left">
            <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start mb-7">
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1E3A8A] animate-pulse flex-shrink-0" />
                <span className="text-[#1E3A8A] text-xs font-semibold tracking-wider uppercase">Now in Early Access</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-300 rounded-full px-4 py-1.5 shadow-sm shadow-emerald-100">
                <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="text-emerald-700 text-xs font-bold tracking-wide">Stride Verified</span>
              </div>
            </div>

            {/* Safety Score widget */}
            <div className="flex items-center gap-4 bg-gradient-to-r from-slate-900 to-[#0d2060] rounded-2xl px-5 py-4 mb-7 max-w-sm mx-auto lg:mx-0 border border-white/10 shadow-xl">
              <div className="relative flex-shrink-0 w-14 h-14 rounded-xl bg-emerald-500/20 border-2 border-emerald-400/50 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-emerald-300 leading-none">{scoreDisplay}</span>
                <span className="text-[9px] text-emerald-400/80 font-bold">/100</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-2">
                  <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  <span className="text-white text-xs font-bold">Safety Score — Stride Verified</span>
                </div>
                {[{ label: "Protocol", w: "95%" }, { label: "Feedback", w: "93%" }, { label: "Response", w: "100%" }].map(({ label, w }) => (
                  <div key={label} className="flex items-center gap-2 mb-1">
                    <div className="w-12 text-[9px] text-slate-400 font-medium">{label}</div>
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full transition-all duration-700" style={{ width: w }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.2rem] font-black leading-[1.1] text-slate-900 mb-6">
              Stop Managing.{" "}
              <span className="text-[#1E3A8A]">Start Automating.</span>
              <br className="hidden sm:block" />
              The AI Platform for{" "}
              <span className="relative inline-block">
                <span className="relative z-10">Dance &amp; Sports Academies.</span>
                <span className="absolute bottom-1 left-0 w-full h-3 bg-amber-300/40 -z-0 rounded" />
              </span>
            </h1>

            <p className="text-lg text-slate-500 leading-relaxed mb-2 max-w-xl mx-auto lg:mx-0">
              We don't sell colored spreadsheets.
            </p>
            <p className="text-lg text-slate-500 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              Absolute operational automation and total legal peace of mind — in a single click.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <a href="/register"
                className="inline-flex items-center justify-center gap-2 bg-amber-400 text-slate-900 font-black px-8 py-4 rounded-xl text-base hover:bg-amber-300 transition-colors shadow-lg shadow-amber-200">
                Check Your School's Safety Score
                <IconArrow />
              </a>
              <a href="#features"
                className="inline-flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 font-semibold px-8 py-4 rounded-xl text-base hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition-colors">
                See how it works
              </a>
            </div>

            <p className="mt-4 text-sm text-slate-400">No credit card required. Setup in 60 seconds.</p>
          </div>

          {/* Phone mockup — light version */}
          <div className="flex-shrink-0">
            <div className="relative w-[240px] h-[480px] mx-auto">
              <div className="absolute inset-0 bg-[#1E3A8A]/8 rounded-[3rem] blur-3xl scale-110" />
              <div className="relative w-full h-full bg-[#0d1a3e] border-[3px] border-[#1E3A8A]/25 rounded-[3rem] overflow-hidden shadow-[0_24px_60px_rgba(30,58,138,0.18)] flex flex-col">
                <div className="w-24 h-6 bg-[#0a1020] rounded-b-2xl mx-auto flex-shrink-0" />
                {/* Status bar */}
                <div className="px-5 pt-2 pb-1 flex items-center justify-between">
                  <div className="text-white/40 text-[10px] font-medium">9:41</div>
                  <div className="flex gap-1">
                    <div className="w-3 h-1.5 bg-white/30 rounded-sm" />
                    <div className="w-3 h-1.5 bg-white/30 rounded-sm" />
                    <div className="w-4 h-1.5 bg-amber-400 rounded-sm" />
                  </div>
                </div>
                <div className="flex-1 px-4 py-2 flex flex-col gap-2 overflow-hidden">
                  <div className="bg-amber-400 rounded-xl h-10 flex items-center justify-center gap-2 mb-1">
                    <div className="w-5 h-5 bg-[#0a1020]/20 rounded-lg" />
                    <div className="w-24 h-2.5 bg-[#0a1020]/25 rounded-full" />
                  </div>
                  {[
                    ["Sofia R.", "✅", "Checked in"],
                    ["Marco B.", "✅", "Checked in"],
                    ["Anna K.", "⏳", "Pending"],
                    ["Luca M.", "✅", "Checked in"],
                    ["Giulia F.", "❌", "Absent"],
                  ].map(([name, icon]) => (
                    <div key={name} className="bg-white/8 rounded-xl px-3 py-2.5 flex items-center gap-2.5 border border-white/5">
                      <div className="w-8 h-8 rounded-lg bg-[#1E3A8A]/40 flex items-center justify-center flex-shrink-0 text-sm">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="h-2 bg-white/40 rounded-full w-4/5 mb-1.5" />
                        <div className="h-1.5 bg-white/20 rounded-full w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="w-20 h-1 bg-white/20 rounded-full mx-auto mb-3 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────────── */}
      <div className="bg-[#1E3A8A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { n: "500+", label: "Schools Onboarded" },
            { n: "12k+", label: "Active Members" },
            { n: "99.9%", label: "Platform Uptime" },
            { n: "0%", label: "Commission on Trials" },
          ].map(({ n, label }) => (
            <div key={label}>
              <div className="text-3xl font-black text-amber-400">{n}</div>
              <div className="text-sm text-blue-200 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── STRIDE SAFETY STANDARD ─────────────────────────────────────── */}
      <section id="safety-standard" className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider mb-5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Stride Verified
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              The Stride{" "}
              <span className="text-emerald-600">Safety Standard</span>
            </h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">
              Every school on Stride is scored in real time across three independent pillars. The badge is earned, not assigned.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="bg-slate-900 rounded-3xl p-8 shadow-2xl">
              {/* Score header */}
              <div className="flex items-start gap-6 mb-8">
                <div className="w-20 h-20 flex-shrink-0 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400/50 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-emerald-300 leading-none">95</span>
                  <span className="text-[10px] text-emerald-400/80 font-bold mt-0.5">/100</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-black text-xl">Elite Dance Academy</span>
                    <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Stride Verified
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm">Sydney, AU · 127 parent reviews · Updated in real time</p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {["Protocol ✓", "Feedback ✓", "Response ✓"].map(t => (
                      <span key={t} className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pillar bars */}
              <div className="space-y-6">
                {SAFETY_PILLARS.map(({ label, value, max, barColor, desc }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-white text-sm font-bold">{label}</span>
                        <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
                      </div>
                      <span className="text-sm font-black ml-4 flex-shrink-0" style={{ color: barColor }}>
                        {value}<span className="text-slate-500 font-normal text-xs">/{max}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${(value / max) * 100}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-white/8 flex items-center justify-between">
                <p className="text-slate-500 text-xs">Scores recalculate continuously as new data arrives.</p>
                <a href="/register"
                  className="inline-flex items-center gap-2 bg-emerald-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-emerald-400 transition-colors">
                  Verify Your School
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ────────────────────────────────────────────────── */}
      <section id="pain-points" className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">The Problem</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              4 Things Draining Your School Every Day
            </h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">
              Sound familiar? These are the operational failures costing you time, money, and peace of mind.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PAIN_POINTS.map(({ emoji, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 flex gap-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">{emoji}</div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI CORES ───────────────────────────────────────────────────── */}
      <section id="ai-cores" className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-blue-100 text-[#1E3A8A] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">AI Engine</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              3 Intelligent Cores.{" "}
              <span className="text-[#1E3A8A]">Zero Manual Intervention.</span>
            </h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">
              Advanced AI running silently in the background — so your team handles people, not paperwork.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {AI_CORES.map(({ Icon, tag, title, desc, color, iconBg }) => (
              <div key={title}
                className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center text-white mb-5 flex-shrink-0`}>
                  <Icon />
                </div>
                <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${color} mb-3`}>{tag}</span>
                <h3 className="text-lg font-black text-slate-900 mb-3">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REAL-TIME TRANSPARENCY ─────────────────────────────────────── */}
      <section id="transparency" className="bg-[#061020]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">Live Activity Feed</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white">Real-Time Transparency</h2>
              <p className="text-slate-400 text-sm mt-2 max-w-md">Every pickup is logged. Every check-in is timestamped. Zero gaps. Zero surprises. The feed below is live.</p>
            </div>
            <div className="flex-shrink-0 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-center">
              <div className="text-3xl font-black text-emerald-400">100%</div>
              <div className="text-slate-400 text-xs mt-1">Audit Coverage</div>
            </div>
          </div>

          <div className="space-y-3">
            {(liveFeed.length > 0 ? liveFeed : [
              { event: "Child picked up safely", timestamp: new Date(Date.now() - 3 * 60000).toISOString(), school: "Elite Dance Academy" },
              { event: "Child picked up safely", timestamp: new Date(Date.now() - 8 * 60000).toISOString(), school: "ArtMotion Studio" },
              { event: "Child picked up safely", timestamp: new Date(Date.now() - 14 * 60000).toISOString(), school: "Prestige Ballet" },
              { event: "Child picked up safely", timestamp: new Date(Date.now() - 21 * 60000).toISOString(), school: "Sydney Stars SC" },
              { event: "Child picked up safely", timestamp: new Date(Date.now() - 35 * 60000).toISOString(), school: "PureMotion Institute" },
            ] as FeedEntry[]).map((entry, i) => {
              const mins = Math.round((Date.now() - new Date(entry.timestamp).getTime()) / 60000);
              return (
                <div key={i} className="flex items-center gap-4 bg-white/4 border border-white/8 rounded-xl px-5 py-3.5 hover:bg-white/6 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">{entry.event}</p>
                    <p className="text-slate-500 text-xs">{entry.school} · Child ID anonymised per GDPR</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-emerald-400 text-xs font-bold">{mins < 1 ? "just now" : `${mins}m ago`}</span>
                    <p className="text-slate-600 text-[10px] mt-0.5">Signature captured</p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-center text-slate-600 text-xs mt-6">
            Child identities are never shown publicly. All data is anonymised and GDPR-compliant.
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-[#0A1128] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">

          {/* Header */}
          <div className="text-center mb-16">
            <span className="inline-block border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest mb-5">
              Inside the AI Engine
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight mb-5">
              How the Magic Works{" "}
              <span className="block sm:inline text-[#D4AF37]">(Without the Friction)</span>
            </h2>
            <p className="text-blue-200/70 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              A behind-the-scenes look at how our background AI eliminates 90% of your daily administrative tasks in seconds.
            </p>
          </div>

          {/* Vision AI Steps */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <div className="text-white font-bold text-base">Vision AI — Document Verification</div>
                <div className="text-blue-300/60 text-xs uppercase tracking-widest mt-0.5">3-step automated lifecycle</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 md:gap-0 relative">
              {/* Connector line — desktop only */}
              <div className="hidden md:block absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-[#D4AF37]/20 via-[#D4AF37]/60 to-[#D4AF37]/20 z-0" />

              {[
                {
                  n: "01",
                  title: "The Parent Snaps & Sends",
                  desc: "Parents take a quick photo of medical clearances or privacy waivers on their phone. No complex scanners or formatting rules required.",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                  ),
                },
                {
                  n: "02",
                  title: "Multilingual Semantic Extraction",
                  desc: "Our integrated engine instantly reads the document in English or Italian. It automatically locates the student's name, calculates the exact expiration date, and visually confirms the doctor's stamp and signature.",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                    </svg>
                  ),
                },
                {
                  n: "03",
                  title: "Automated Safeguard & Gatekeeper",
                  desc: "High-confidence verifications instantly update student records and clear the Kiosk gate for entry. If a document is blurry or uncertain, it flags the exact detail for a 1-click human approval. You only intervene when strictly necessary.",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  ),
                },
              ].map(({ n, title, desc, icon }, idx) => (
                <div key={n} className="relative z-10 flex flex-col">
                  {/* Mobile connector */}
                  {idx < 2 && (
                    <div className="md:hidden w-px h-8 bg-gradient-to-b from-[#D4AF37]/60 to-[#D4AF37]/10 mx-auto my-0" />
                  )}
                  <div className="flex-1 bg-white/5 border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 rounded-2xl p-6 sm:p-7 flex flex-col gap-4 transition-all duration-200 hover:bg-white/8 md:mx-2">
                    {/* Step number + icon row */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#D4AF37] flex items-center justify-center text-[#0A1128] flex-shrink-0 font-black text-sm shadow-lg shadow-[#D4AF37]/20">
                        {icon}
                      </div>
                      <span className="text-[#D4AF37]/50 font-black text-3xl leading-none tracking-tight">{n}</span>
                    </div>
                    <h3 className="text-white font-bold text-base leading-snug">{title}</h3>
                    <p className="text-blue-200/60 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart Rostering Card */}
          <div className="relative rounded-2xl overflow-hidden border border-[#D4AF37]/25 bg-gradient-to-br from-[#0D1A3E] to-[#0A1128]">
            {/* Gold corner accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#D4AF37]/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#D4AF37]/4 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

            <div className="relative p-7 sm:p-9 flex flex-col sm:flex-row gap-7 items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
                  <svg className="w-7 h-7 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                      d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                  </svg>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-white font-black text-xl">Predictive Operations</span>
                  <span className="text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/25 px-2.5 py-1 rounded-full uppercase tracking-widest">Smart Rostering</span>
                </div>
                <p className="text-blue-200/70 text-sm sm:text-base leading-relaxed">
                  When an operator schedules a future absence, the system doesn't just send a generic alert. The engine cross-references historical schedules and payroll rates to instantly recommend the{" "}
                  <span className="text-[#D4AF37] font-semibold">top 3 pre-verified substitutes</span>{" "}
                  available for that specific hour, ready to be dispatched with one tap.
                </p>
              </div>

              {/* Mini substitute mockup */}
              <div className="flex-shrink-0 w-full sm:w-52">
                <div className="bg-[#0A1128]/80 border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
                  <div className="text-[10px] text-[#D4AF37]/70 font-bold uppercase tracking-widest mb-1">Top Substitutes</div>
                  {[
                    { name: "M. Rossi", match: "98%", avail: "Available" },
                    { name: "L. Ferrari", match: "94%", avail: "Available" },
                    { name: "G. Bianchi", match: "87%", avail: "On standby" },
                  ].map(({ name, match, avail }) => (
                    <div key={name} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#1E3A8A]/60 flex-shrink-0 flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-white/30" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-semibold">{name}</div>
                        <div className="text-blue-300/50 text-[10px]">{avail}</div>
                      </div>
                      <div className="text-[#D4AF37] text-xs font-bold flex-shrink-0">{match}</div>
                    </div>
                  ))}
                  <button className="mt-1 w-full bg-[#D4AF37] text-[#0A1128] text-xs font-black py-2 rounded-lg hover:bg-amber-300 transition-colors">
                    Dispatch Top Match
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Copilot Preview */}
          <div className="mt-8 relative rounded-2xl overflow-hidden border border-[#D4AF37]/25 bg-[#070F26]">
            {/* Subtle glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-[#D4AF37]/6 rounded-full blur-3xl pointer-events-none" />

            <div className="relative p-7 sm:p-9">
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-7">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-black text-xl">Admin Copilot AI</span>
                      <span className="text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/25 px-2.5 py-1 rounded-full uppercase tracking-widest">Natural Language</span>
                    </div>
                    <p className="text-blue-200/55 text-sm mt-1">Ask questions about your school in plain English. The AI queries live data and answers instantly.</p>
                  </div>
                </div>
                {/* Live badge */}
                <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 self-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE ENGINE
                </div>
              </div>

              {/* Chat examples */}
              <div className="flex flex-col gap-3">
                {[
                  {
                    q: "Who has an expired medical certificate?",
                    a: "4 students are currently blocked at the Kiosk due to expired certificates.",
                    intent: "expired_certs",
                  },
                  {
                    q: "What is total revenue this month?",
                    a: "\u20ac14,250 collected in May \u2014 up 12% compared to April.",
                    intent: "revenue",
                  },
                  {
                    q: "Which operators are absent next week?",
                    a: "Operator Marco is absent Friday. AI-suggested substitute: Sara (94% match).",
                    intent: "absences",
                  },
                ].map(({ q, a, intent }) => (
                  <div key={intent} className="bg-white/4 hover:bg-white/6 border border-white/8 hover:border-[#D4AF37]/25 rounded-xl p-4 sm:p-5 transition-all duration-200 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    {/* Question */}
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-[#1E3A8A]/60 border border-blue-500/20 flex items-center justify-center mt-0.5">
                        <svg className="w-3 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      </div>
                      <p className="text-blue-200/80 text-sm italic leading-relaxed">&quot;{q}&quot;</p>
                    </div>
                    {/* Answer */}
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center mt-0.5">
                        <svg className="w-3.5 h-3.5 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      </div>
                      <p className="text-white text-sm font-medium leading-relaxed">{a}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer note */}
              <p className="text-blue-200/40 text-xs text-center mt-5">
                All answers are generated in real time from your live school database &mdash; no manual queries required.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* ── COMPARISON ─────────────────────────────────────────────────── */}
      <section id="comparison" className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">The Switch</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">The Headache Eliminator</h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">Your old software isn't just slow — it's costing you money, liability exposure, and parent trust every single day.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {/* Legacy */}
            <div className="bg-white rounded-2xl p-7 border border-red-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-lg flex-shrink-0">💀</div>
                <div>
                  <div className="text-slate-900 font-black text-base">Legacy Competitors</div>
                  <div className="text-xs text-red-500 font-semibold uppercase tracking-wider mt-0.5">The Old World</div>
                </div>
              </div>
              <ul className="flex flex-col gap-3">
                {[
                  "Desktop-only software built in 2012 — no mobile, no kiosk",
                  "Hundreds of paper forms reviewed by hand every week",
                  "Endless phone tag to track down missing students",
                  "Complex Excel payroll loops recalculated manually at month-end",
                  "Zero legal gatekeeping — unsigned waivers slip through",
                  "Flat monthly fees regardless of how many members are active",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-500 leading-relaxed">
                    <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Stride */}
            <div className="bg-[#1E3A8A] rounded-2xl p-7 shadow-lg shadow-blue-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-lg flex-shrink-0">⚡</div>
                <div>
                  <div className="text-white font-black text-base">Stride Platform</div>
                  <div className="text-xs text-blue-300 font-semibold uppercase tracking-wider mt-0.5">The New Standard</div>
                </div>
              </div>
              <ul className="flex flex-col gap-3">
                {[
                  "Mobile-First Kiosk Terminal tracking minors in real-time with QR precision",
                  "Vision AI reads and validates certificates in under 3 seconds",
                  "Automatic legal gatekeepers — unsigned docs block access instantly",
                  "Predictive absence engine pre-stages substitutions before admin wakes up",
                  "Instant Stripe Connect payouts — 1-click payroll, zero friction",
                  "Pay only per active enrolled member — zero fees when they unenroll",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-blue-100 leading-relaxed">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 max-w-5xl mx-auto bg-white rounded-2xl px-7 py-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left border border-slate-100 shadow-sm">
            <div className="text-3xl flex-shrink-0">🚀</div>
            <div className="min-w-0">
              <div className="text-slate-900 font-bold mb-1">Ready to make the switch?</div>
              <div className="text-sm text-slate-500">Up and running in under an hour. No migration complexity.</div>
            </div>
            <a href="/register"
              className="flex-shrink-0 sm:ml-auto bg-amber-400 text-slate-900 font-bold px-6 py-3 rounded-xl text-sm hover:bg-amber-300 transition-colors whitespace-nowrap shadow-md shadow-amber-100">
              Get Started / Schedule Pilot
            </a>
          </div>
        </div>
      </section>

      {/* ── 4 PILLARS ──────────────────────────────────────────────────── */}
      <section id="features" className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">The Platform</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              4 Pillars That Replace Your Entire Admin Stack
            </h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">
              Purpose-built for dance schools, martial arts gyms, and cultural associations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {PILLARS.map(({ Icon, title, tag, desc, iconBg }) => (
              <div key={title}
                className="bg-white rounded-2xl p-7 flex flex-col border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center text-white mb-5 flex-shrink-0`}>
                  <Icon />
                </div>
                <span className="text-xs font-bold text-[#1E3A8A] uppercase tracking-widest mb-2">{tag}</span>
                <h3 className="text-base font-bold text-slate-900 mb-3">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE ─────────────────────────────────────────────────── */}
      <section id="compliance" className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">Compliance</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              Built for Your Legal Framework, Not Against It
            </h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">Automated adaptations for three distinct regulatory environments.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {COMPLIANCE_REGIONS.map(({ flag, label, sub, detail, currency: cur }) => (
              <div key={label} className="bg-white rounded-2xl p-7 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-3xl">{flag}</span>
                  <div className="min-w-0">
                    <div className="text-slate-900 font-bold">{label}</div>
                    <div className="text-xs text-slate-400">{sub}</div>
                  </div>
                  <span className="ml-auto text-xs font-bold text-[#1E3A8A] bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full flex-shrink-0">{cur}</span>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-white rounded-2xl px-7 py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left border border-slate-100 shadow-sm">
            <div className="text-3xl flex-shrink-0">🌍</div>
            <div>
              <div className="text-slate-900 font-bold mb-1">Multi-currency billing is automatic</div>
              <div className="text-sm text-slate-500">AUD for Australian entities, EUR for European ones. No manual conversion, no FX surprises.</div>
            </div>
            <a href="/register"
              className="flex-shrink-0 sm:ml-auto bg-[#1E3A8A] text-white font-bold px-6 py-3 rounded-xl text-sm hover:bg-[#1e3070] transition-colors whitespace-nowrap">
              Get Started Free
            </a>
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">Pricing</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">Pay Per Active QR Code.</h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">
              No flat fees. No commissions. Volume discounts kick in automatically.
              Pick-up contacts are always free.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-lg shadow-slate-100">
            {/* Free trial badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-5 py-2">
                <span className="text-amber-500 text-lg">🎉</span>
                <span className="text-amber-700 font-bold text-sm">First 30 days: 100% Free. No credit card required.</span>
              </div>
            </div>

            {/* Currency selector */}
            <div className="flex justify-center gap-2 mb-8">
              {(["USD", "AUD", "EUR"] as const).map(cur => (
                <button key={cur} onClick={() => setCurrency(cur)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                    currency === cur
                      ? "bg-[#1E3A8A] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {cur === "USD" ? "$ USD" : cur === "AUD" ? "A$ AUD" : "\u20AC EUR"}
                </button>
              ))}
            </div>

            {/* QR code slider */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-slate-400 mb-3">
                <span>10 QR codes</span>
                <span className="text-[#1E3A8A] font-bold text-sm">{qrCodes} active QR codes</span>
                <span>1,000 QR codes</span>
              </div>
              <input type="range" min={10} max={1000} step={10} value={qrCodes}
                onChange={e => setQrCodes(Number(e.target.value))}
                className="stride-slider w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #1E3A8A ${((qrCodes - 10) / 990) * 100}%, #e2e8f0 ${((qrCodes - 10) / 990) * 100}%)` }}
              />
            </div>

            {/* Tier indicator strip */}
            <div className="flex gap-1 mb-8 text-xs">
              <div className={`flex-none px-3 py-1 rounded-full font-bold transition-colors ${qrCodes <= 100 ? "bg-[#1E3A8A] text-white" : "bg-slate-100 text-slate-400"}`}>
                Tier 1 · 1–100
              </div>
              <div className={`flex-none px-3 py-1 rounded-full font-bold transition-colors ${qrCodes > 100 && qrCodes <= 300 ? "bg-[#1E3A8A] text-white" : "bg-slate-100 text-slate-400"}`}>
                Tier 2 · 101–300
              </div>
              <div className={`flex-none px-3 py-1 rounded-full font-bold transition-colors ${qrCodes > 300 ? "bg-[#1E3A8A] text-white" : "bg-slate-100 text-slate-400"}`}>
                Tier 3 · 301+
              </div>
            </div>

            {/* Price display */}
            <div className="text-center bg-slate-50 border border-slate-100 rounded-2xl px-6 py-7 mb-6">
              <div className="text-4xl sm:text-5xl font-black text-[#1E3A8A] mb-2">
                {symbol}{monthlyTotal}
                <span className="text-xl text-slate-500 font-normal">/mo</span>
              </div>
              <p className="text-slate-600 text-sm mt-2">
                {qrCodes} QR codes &nbsp;&middot;&nbsp;{" "}
                <span className="font-semibold">{symbol}{perQRRate} effective rate per QR</span>
              </p>
              {volumeSavings && parseFloat(volumeSavings) > 0 && (
                <div className="inline-flex items-center gap-1.5 mt-3 bg-green-50 border border-green-200 rounded-full px-4 py-1.5">
                  <span className="text-green-600 text-xs font-bold">
                    Volume discount saves you {symbol}{volumeSavings}/mo vs flat rate
                  </span>
                </div>
              )}
            </div>

            {/* Tier rate cards */}
            <div className="flex flex-col sm:flex-row gap-4 text-center mb-8">
              {[
                { tier: "Tier 1", range: "1–100 QR codes",   rate: `${symbol}${(1.20 * fx).toFixed(2)}`, active: qrCodes <= 100 },
                { tier: "Tier 2", range: "101–300 QR codes", rate: `${symbol}${(1.05 * fx).toFixed(2)}`, active: qrCodes > 100 && qrCodes <= 300 },
                { tier: "Tier 3", range: "301+ QR codes",    rate: `${symbol}${(0.90 * fx).toFixed(2)}`, active: qrCodes > 300 },
              ].map(({ tier, range, rate, active }) => (
                <div key={tier}
                  className={`flex-1 rounded-xl px-4 py-4 border transition-all ${
                    active
                      ? "bg-[#1E3A8A] border-[#1E3A8A] text-white shadow-md shadow-blue-200"
                      : "bg-slate-50 border-slate-100"
                  }`}
                >
                  <div className={`font-black text-xl ${active ? "text-amber-300" : "text-[#1E3A8A]"}`}>{rate}</div>
                  <div className={`text-xs mt-0.5 font-bold ${active ? "text-blue-200" : "text-slate-400"}`}>per QR / month</div>
                  <div className={`text-xs mt-1 ${active ? "text-blue-100" : "text-slate-400"}`}>{range}</div>
                  {active && (
                    <div className="mt-2 text-xs font-bold text-amber-300 uppercase tracking-wide">Your Tier</div>
                  )}
                </div>
              ))}
            </div>

            {/* Free pick-up contacts note */}
            <div className="flex items-center justify-center gap-2 mb-8 text-sm text-slate-500 bg-green-50 rounded-xl px-4 py-3 border border-green-100">
              <span className="text-green-500 font-bold text-base">✓</span>
              <span>Authorized pick-up contacts are always <strong className="text-green-700">free of charge</strong></span>
            </div>

            <div className="text-center">
              <a href="/register"
                className="inline-flex items-center gap-2 bg-amber-400 text-slate-900 font-black px-10 py-4 rounded-xl text-base hover:bg-amber-300 transition-colors shadow-lg shadow-amber-100">
                Activate Your Free 30 Days
                <IconArrow />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      {/* ── FEATURED VERIFIED SCHOOLS ──────────────────────────────────── */}
      <section id="schools" className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">Stride Network</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">
              Schools on the{" "}
              <span className="text-[#1E3A8A]">Stride Network</span>
            </h2>
            <p className="mt-4 text-slate-500 max-w-lg mx-auto">
              Discover schools earning the Stride Verified badge — recognised by parents as the gold standard in child safety.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED_SCHOOLS.map(({ name, location, score, isVerified, reviews, discipline }) => {
              const scoreColor = score >= 85 ? "#059669" : score >= 70 ? "#D97706" : "#2563EB";
              return (
                <div key={name} className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
                  {/* Ribbon */}
                  {isVerified && (
                    <div className="absolute top-0 right-0">
                      <div className="relative w-24 h-24 overflow-hidden">
                        <div className="absolute top-4 -right-6 w-28 bg-gradient-to-r from-amber-400 to-emerald-500 text-white text-[10px] font-black text-center py-1 rotate-45 shadow-md">
                          VERIFIED
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Score ring */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl flex flex-col items-center justify-center border-2 flex-shrink-0"
                      style={{ borderColor: scoreColor, backgroundColor: `${scoreColor}10` }}>
                      <span className="text-lg font-black leading-none" style={{ color: scoreColor }}>{score}</span>
                      <span className="text-[9px] font-bold" style={{ color: scoreColor }}>/100</span>
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">{name}</h3>
                      <p className="text-slate-400 text-xs mt-0.5">{location}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">{discipline}</span>
                    <span className="text-xs text-slate-400">{reviews} reviews</span>
                  </div>

                  {isVerified && (
                    <div className="mt-4 flex items-center gap-1.5 text-emerald-600">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                      <span className="text-xs font-bold">Stride Verified School</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-12 text-center">
            <a href="/register"
              className="inline-flex items-center gap-2 bg-[#1E3A8A] text-white font-black px-8 py-4 rounded-xl text-base hover:bg-[#1e3070] transition-colors shadow-lg shadow-blue-200">
              Get Your School Verified
              <IconArrow />
            </a>
            <p className="mt-3 text-sm text-slate-400">Scores are live — start collecting reviews today.</p>
          </div>
        </div>
      </section>

      <section id="faq" className="bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <span className="inline-block bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900">Common Questions</h2>
            <p className="mt-4 text-slate-500">Everything you need to know before you start.</p>
          </div>

          <div className="flex flex-col gap-3">
            {FAQS.map(({ q, a }, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors">
                  <span className="font-semibold text-slate-900 text-sm sm:text-base">{q}</span>
                  <span className="text-[#1E3A8A]"><IconChevron open={openFaq === i} /></span>
                </button>
                <div style={{ maxHeight: openFaq === i ? "200px" : "0", overflow: "hidden", transition: "max-height 0.3s ease" }}>
                  <p className="px-6 pb-5 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-4">{a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER CTA ─────────────────────────────────────────────────── */}
      <footer className="bg-[#1E3A8A]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span className="text-blue-100 text-xs font-semibold tracking-wider uppercase">Pioneer Access — Limited Slots</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
            Stop Managing.<br className="hidden sm:block" />
            <span className="text-amber-400"> Start Automating Today.</span>
          </h2>
          <p className="text-blue-200 text-lg mb-10 max-w-xl mx-auto">
            Join hundreds of academies already running cleaner, faster, and legally bulletproof operations.
          </p>
          <a href="/register"
            className="inline-flex items-center gap-3 bg-amber-400 text-slate-900 font-black px-10 py-5 rounded-xl text-lg hover:bg-amber-300 transition-colors shadow-xl shadow-black/20">
            Get Started / Schedule Pilot
            <IconArrow />
          </a>
          <p className="mt-5 text-sm text-blue-300">No credit card. No contracts. Cancel any time.</p>

          <div className="flex flex-wrap justify-center gap-3 mt-10">
            {[
              { icon: "🔒", label: "SSL Encrypted" },
              { icon: "☁️", label: "99.9% Uptime SLA" },
              { icon: "💳", label: "Stripe Payments" },
              { icon: "🏢", label: "Multi-Tenant Isolated" },
              { icon: "🌍", label: "GDPR Compliant" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-4 py-1.5 text-xs text-blue-200">
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#151f3e]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-blue-300">
            <a href="/" className="flex items-center gap-2 no-underline">
              <svg height="28" width="28" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="9" fill="white" fillOpacity="0.1" />
                <path d="M9 18h18M18 10l8 8-8 8" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold text-white">Stride</span>
            </a>
            <span>{"\u00A9"} {new Date().getFullYear()} Stride Platform. All rights reserved.</span>
            <div className="flex gap-5">
              <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms"   className="hover:text-white transition-colors">Terms of Service</a>
              <a href="/contact" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

export default function App() {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return (
    <Router base={base}>
      <Switch>
        <Route path="/register"          component={Register} />
        <Route path="/activate"          component={Activate} />
        <Route path="/payment-success"   component={PaymentSuccessPage} />
        <Route path="/payment-cancelled" component={PaymentCancelledPage} />
        <Route path="/payment-batch"     component={PaymentBatchPage} />
        <Route path="/billing-success"   component={BillingSuccessPage} />
        <Route path="/billing-cancel"    component={BillingCancelPage} />
        <Route path="/stripe-return"     component={StripeReturnPage} />
        <Route path="/terms"             component={TermsPage} />
        <Route path="/privacy"           component={PrivacyPage} />
        <Route path="/contact"           component={ContactPage} />
        <Route component={Landing} />
      </Switch>
    </Router>
  );
}
