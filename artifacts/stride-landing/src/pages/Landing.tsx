import { useState, useEffect, useRef } from "react";
import { TrustBadge } from "../components/TrustBadge";

// ── Animated counter ──────────────────────────────────────────────────────────

function useCount(target: number, ms = 1200) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      setVal(Math.round(p * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return val;
}

// ── Comparison data ───────────────────────────────────────────────────────────

const COMPARISON = [
  { feature: "Attendance",           paper: "Manual roll call",                  stride: "QR check-in — instant, immutable" },
  { feature: "Pickup authorization", paper: "Verbal confirmation",               stride: "Guardian Circle QR + real-time alert" },
  { feature: "Security audit trail", paper: "Paper binder — lost or destroyed",  stride: "SHA-256 Security Timeline, permanent" },
  { feature: "Proof of presence",    paper: "Handwritten sign-in sheet",         stride: "Cryptographic hash per check-in" },
  { feature: "Emergency alerts",     paper: "Phone tree — minutes or hours",     stride: "Emergency Pulse to all members in &lt;3 s" },
  { feature: "Incident records",     paper: "Handwritten, no search",            stride: "Searchable digital Security Timeline" },
];

// ── Feature data ──────────────────────────────────────────────────────────────

const SCHOOL_FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="14" y2="14" />
        <line x1="17" y1="14" x2="21" y2="14" /><line x1="14" y1="17" x2="14" y2="21" />
        <line x1="17" y1="17" x2="21" y2="17" /><line x1="21" y1="21" x2="21" y2="21" />
      </svg>
    ),
    tag: "Smart Attendance",
    title: "QR Kiosk Check-In",
    desc: "Drop a tablet at your door. Members scan their QR — attendance is marked instantly, in real time. No clipboards, no delays, no errors.",
    accent: "bg-[#1E3A8A] text-white",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    tag: "Dependant Safety",
    title: "Smart Pick-Up Control",
    desc: "Define exactly who can collect each dependant. Unauthorised pickup attempts trigger an immediate alert to school staff.",
    accent: "bg-indigo-600 text-white",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    tag: "Zero Liability",
    title: "Digital Legal Gate",
    desc: "Consent forms, waivers, and media releases — signed on the member's phone before first access. SHA-256 audit trail included.",
    accent: "bg-violet-600 text-white",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    tag: "0% Commission",
    title: "Stripe Direct Payroll",
    desc: "Member fees land in your account. Operator earnings are distributed automatically. No middleman cuts, no manual bank transfers.",
    accent: "bg-amber-500 text-white",
  },
];

const PARENT_FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
    title: "Real-Time Check-In Alerts",
    desc: "A push notification the moment your child scans in — with the name of the staff member who acknowledged them.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    title: "Authorised Pickup Control",
    desc: "Add or revoke pickup contacts from your phone, anytime. Every change is logged — no school can release your child without your approval.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Emergency Pulse Alerts",
    desc: "Schools broadcast emergency alerts to all member phones simultaneously. One-tap acknowledgment confirms receipt — bypasses silent mode.",
  },
];

const HOW_STEPS = [
  {
    n: "01",
    title: "School signs up in minutes",
    desc: "Register your school, configure your class schedule, and invite your operators — all in one setup flow. No IT team required.",
  },
  {
    n: "02",
    title: "Members sign documents on their phones",
    desc: "Families receive an invite link, review all consent documents, and sign digitally before their first session.",
  },
  {
    n: "03",
    title: "QR kiosk runs attendance automatically",
    desc: "Members check in at the door. Real-time attendance, late arrivals, and no-shows — without lifting a finger.",
  },
];

const PRIVACY_PILLARS = [
  {
    title: "Data Encryption",
    badge: "AES-256",
    desc: "All data is encrypted at rest and in transit using AES-256 standards. Movement history is stored in a secure, isolated database.",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconColor: "text-emerald-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    title: "GDPR & CCPA Compliant",
    badge: "Global",
    desc: "Fully compliant with global data protection standards. No personally identifiable movement data is shared with third parties. Ever.",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    iconColor: "text-blue-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
  {
    title: "The 'Local-Only' Rule",
    badge: "Zero PII",
    desc: "Wearable UUIDs are randomly generated anonymous identifiers. They contain NO child name or personal info — only the secure portal can link them.",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    iconColor: "text-violet-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Full Parental Control",
    badge: "Transparent",
    desc: "View all recorded logs, disable proximity tracking at any time, and request a full data audit export — always, no questions asked.",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    iconColor: "text-amber-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
];

const FAQS = [
  {
    q: "Do I need a credit card to start the trial?",
    a: "No. Full, unrestricted access for 30 days with zero payment details required. Your account activates the moment you confirm your email.",
  },
  {
    q: "How does the QR pricing work?",
    a: "You pay per active QR code per month. Members, operators, admins, and kiosk tablets each count as one billable QR. Volume discounts apply automatically: $1.20 for the first 100, $1.05 up to 300, and $0.90 above that. Authorised pick-up contacts are always free.",
  },
  {
    q: "What if a kiosk tablet is lost or stolen?",
    a: "Use Revoke Access from your operator phone to force-logout and lock the device remotely. The tablet loses all session access within seconds — even if offline.",
  },
  {
    q: "Is my members' data private and secure?",
    a: "Each school's data is in a fully isolated tenant environment. Cross-tenant access is architecturally impossible. All traffic is encrypted in transit (TLS 1.3) and at rest (AES-256).",
  },
  {
    q: "Can I manage multiple venues or class types?",
    a: "Yes. Multi-location architecture is natively supported. Create separate schedules, staff pools, and attendance rosters per venue — all under one admin account.",
  },
];

// ── Pricing helpers ───────────────────────────────────────────────────────────

type CurrencyKey = "AUD" | "EUR" | "USD";

const FX:  Record<CurrencyKey, number> = { AUD: 1, EUR: 0.60, USD: 0.65 };
const SYM: Record<CurrencyKey, string> = { AUD: "A$", EUR: "\u20AC", USD: "$" };

function calcBill(qr: number, fx: number): number {
  if (qr <= 0) return 0;
  let t = 0, r = qr;
  if (r > 0) { const u = Math.min(r, 100); t += u * 1.20 * fx; r -= u; }
  if (r > 0) { const u = Math.min(r, 200); t += u * 1.05 * fx; r -= u; }
  if (r > 0) { t += r * 0.90 * fx; }
  return Math.round(t * 100) / 100;
}

// ── Inline icons ──────────────────────────────────────────────────────────────

const IcoArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
const IcoCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IcoChevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const Logo = () => (
  <svg height="28" width="28" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="9" fill="#1E3A8A" />
    <path d="M9 18h18M18 10l8 8-8 8" stroke="#D4AF37" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Stat counters ─────────────────────────────────────────────────────────────

const STATS = [
  { n: "500+",  label: "Schools Onboarded" },
  { n: "12k+",  label: "Active Members" },
  { n: "99.9%", label: "Platform Uptime" },
  { n: "0%",    label: "Commission on Trials" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrCodes,  setQrCodes]  = useState(50);
  const [currency, setCurrency] = useState<CurrencyKey>("AUD");
  const [openFaq,  setOpenFaq]  = useState<number | null>(null);

  const sym   = SYM[currency];
  const fx    = FX[currency];
  const total = calcBill(qrCodes, fx).toFixed(2);
  const perQR = qrCodes > 0 ? (calcBill(qrCodes, fx) / qrCodes).toFixed(3) : "0.000";
  const flat  = (qrCodes * 1.20 * fx).toFixed(2);
  const saved = qrCodes > 100 ? Math.max(0, parseFloat(flat) - calcBill(qrCodes, fx)).toFixed(2) : null;

  const navLinks = [
    ["#for-schools",     "For Schools"],
    ["#emergency-pulse", "Emergency Pulse"],
    ["#for-members",     "For Members"],
    ["#pricing",         "Pricing"],
    ["#faq",             "FAQ"],
  ];

  return (
    <div className="bg-white text-slate-900 min-h-screen overflow-x-hidden font-sans">

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <Logo />
            <span className="text-base font-bold text-[#1E3A8A] tracking-wide">Stride</span>
            <span className="hidden sm:inline text-slate-400 text-sm font-normal">Platform</span>
          </a>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(([href, label]) => (
              <a key={label} href={href}
                className="text-sm text-slate-600 hover:text-[#1E3A8A] font-medium transition-colors no-underline">
                {label}
              </a>
            ))}
            <a href="/register"
              className="bg-[#D4AF37] text-[#0A192F] text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-[#e8c44b] transition-colors no-underline">
              Get Started Free
            </a>
          </div>

          <button className="md:hidden text-slate-500 p-1" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-6 py-5 flex flex-col gap-4 shadow-lg">
            {navLinks.map(([href, label]) => (
              <a key={label} href={href}
                className="text-sm text-slate-600 hover:text-[#1E3A8A] font-medium no-underline"
                onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
            <a href="/register"
              className="bg-[#D4AF37] text-[#0A192F] text-sm font-bold px-5 py-3 rounded-lg text-center no-underline"
              onClick={() => setMenuOpen(false)}>
              Get Started Free — 30-Day Trial
            </a>
          </div>
        )}
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-24">
        <div className="flex flex-col lg:flex-row items-center gap-14 lg:gap-20">

          {/* Left — copy */}
          <div className="flex-1 w-full text-center lg:text-left">
            <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start mb-7">
              <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1E3A8A] animate-pulse flex-shrink-0" />
                <span className="text-[#1E3A8A] text-xs font-semibold tracking-wider uppercase">Free 30-Day Trial — No Card Required</span>
              </span>
              <span className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <span className="text-emerald-700 text-xs font-bold">GDPR Compliant</span>
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.2rem] font-black leading-[1.1] text-slate-900 mb-6">
              The Safety Platform for{" "}
              <span className="text-[#1E3A8A]">Dance Schools &amp; Activity Centres.</span>
            </h1>

            <p className="text-lg text-slate-600 leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
              Immutable QR attendance, verified pick-up control, digital consent forms, and a crisis-ready Emergency Pulse that delivers a forced full-screen alert to every member in under 3 seconds.
            </p>

            <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-8 text-xs font-bold">
              {["Immutable Logs", "Real-Time Alerts", "Verified Pick-Up", "Crisis-Ready"].map(tag => (
                <span key={tag} className="inline-flex items-center gap-1.5 bg-[#1E3A8A]/8 border border-[#1E3A8A]/20 text-[#1E3A8A] rounded-full px-3 py-1.5 tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A8A]" />{tag}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-5">
              <a href="/register"
                className="inline-flex items-center justify-center gap-2 bg-[#D4AF37] text-[#0A192F] font-black px-8 py-4 rounded-xl text-base hover:bg-[#e8c44b] transition-colors shadow-md shadow-amber-100 no-underline">
                Start Free Trial <IcoArrow />
              </a>
              <a href="#for-schools"
                className="inline-flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 font-semibold px-8 py-4 rounded-xl text-base hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition-colors no-underline">
                See All Features
              </a>
            </div>
            <p className="text-sm text-slate-400">Setup in under 60 seconds. Cancel anytime.</p>
          </div>

          {/* Right — activity card */}
          <div className="flex-shrink-0 w-full max-w-sm">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
              {/* Card header */}
              <div className="bg-[#1E3A8A] px-5 py-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-bold">Stride Kiosk — Live</p>
                  <p className="text-blue-300 text-xs">Sofia's Dance Academy</p>
                </div>
                <span className="ml-auto flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
                </span>
              </div>
              {/* Attendance list */}
              <div className="px-5 py-4 space-y-2.5">
                {[
                  ["Sofia R.",  "Checked in",  true],
                  ["Marco B.",  "Checked in",  true],
                  ["Anna K.",   "Pending",      false],
                  ["Luca M.",   "Checked in",  true],
                  ["Giulia F.", "Absent",       false],
                ].map(([name, status, ok]) => (
                  <div key={name as string} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                    <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-black ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-600"}`}>
                      {ok ? "✓" : "·"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 text-sm font-semibold truncate">{name as string}</div>
                      <div className={`text-xs ${ok ? "text-emerald-600" : "text-amber-500"}`}>{status as string}</div>
                    </div>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-400" : "bg-amber-300"}`} />
                  </div>
                ))}
              </div>
              {/* Card footer */}
              <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">4 / 5 checked in</span>
                <span className="bg-[#D4AF37]/15 text-[#9a7d00] text-xs font-bold px-3 py-1 rounded-full border border-[#D4AF37]/30">QR Active</span>
              </div>
            </div>

            {/* Social proof below card */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { n: "500+",  label: "Schools" },
                { n: "12k+",  label: "Members" },
                { n: "99.9%", label: "Uptime" },
              ].map(({ n, label }) => (
                <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-black text-[#1E3A8A]">{n}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────────────── */}
      <div className="bg-[#1E3A8A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map(({ n, label }) => (
            <div key={label}>
              <div className="text-3xl font-black text-[#D4AF37]">{n}</div>
              <div className="text-sm text-blue-200 mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 py-4">
          <TrustBadge className="max-w-7xl mx-auto px-4 sm:px-6 justify-center" />
        </div>
      </div>

      {/* ── WHY STRIDE? COMPARISON ─────────────────────────────────────────── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/20 rounded-full px-4 py-1.5 mb-5">
              <span className="text-[#1E3A8A] text-xs font-bold tracking-wider uppercase">Why Stride?</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">Paper Logs vs. Digital Protocol</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Traditional paper-based systems leave dangerous gaps. Stride closes every one of them.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full stride-table text-sm">
              <thead>
                <tr className="bg-[#1E3A8A] text-white">
                  <th className="text-left font-bold text-[13px] uppercase tracking-wider text-blue-200">Process</th>
                  <th className="text-left font-bold text-[13px] uppercase tracking-wider text-blue-200">
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      Traditional Paper
                    </span>
                  </th>
                  <th className="text-left font-bold text-[13px] uppercase tracking-wider text-[#D4AF37]">
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[#D4AF37]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Stride Digital
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {COMPARISON.map(({ feature, paper, stride }, i) => (
                  <tr key={feature} className={i % 2 === 1 ? "bg-slate-50/60" : ""}>
                    <td className="font-semibold text-slate-800 whitespace-nowrap">{feature}</td>
                    <td>
                      <span className="inline-flex items-center gap-2 text-red-600/80">
                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        <span dangerouslySetInnerHTML={{ __html: paper }} />
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2 text-emerald-700 font-medium">
                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span dangerouslySetInnerHTML={{ __html: stride }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 text-center">
            <a href="/register"
              className="inline-flex items-center gap-2 bg-[#1E3A8A] text-white font-bold px-8 py-3.5 rounded-xl text-sm hover:bg-[#152d6e] transition-colors no-underline">
              Switch to Stride Today
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── FOR SCHOOLS ────────────────────────────────────────────────────── */}
      <section id="for-schools" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/20 rounded-full px-4 py-1.5 mb-5">
              <span className="text-[#1E3A8A] text-xs font-bold tracking-wider uppercase">For Schools &amp; Academies</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Everything You Need to Run Safely
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              One platform replaces attendance sheets, paper waivers, cash payroll, and six different apps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SCHOOL_FEATURES.map(({ icon, tag, title, desc, accent }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-[#1E3A8A]/30 hover:shadow-md transition-all">
                <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center mb-4`}>
                  {icon}
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tag}</span>
                <h3 className="text-base font-black text-slate-900 mt-1 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a href="/register"
              className="inline-flex items-center gap-2 bg-[#1E3A8A] text-white font-bold px-8 py-3.5 rounded-xl text-sm hover:bg-[#152d6e] transition-colors no-underline">
              Register Your School <IcoArrow />
            </a>
          </div>
        </div>
      </section>

      {/* ── EMERGENCY PULSE™ ───────────────────────────────────────────────── */}
      <section id="emergency-pulse" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row items-center gap-16">

            {/* Left — copy */}
            <div className="flex-1">
              <span className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-red-600 text-xs font-bold tracking-widest uppercase">Emergency Pulse&trade;</span>
                <span className="text-red-400 text-xs">Patent Pending</span>
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-5">
                Crisis-Ready Communication.<br />
                <span className="text-[#1E3A8A]">Every Member. Under 3 Seconds.</span>
              </h2>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                In any critical event, Stride delivers a{" "}
                <strong className="text-slate-900">forced, full-screen notification</strong> to every on-site member —
                bypassing silent mode. Receive live Safe / Need&nbsp;Help acknowledgment, updated in real time.
              </p>
              <div className="space-y-5">
                {[
                  { label: "Crisis Broadcast in &lt;3 s", desc: "One tap sends a HIGH-PRIORITY alert to every checked-in member simultaneously. Sub-3-second delivery. Crisis-ready architecture — designed to perform under load." },
                  { label: "Live Acknowledgment Dashboard", desc: "Members respond Safe or Need Help directly from the lock screen. Organisers see a real-time tally — no phone trees, no confusion, no delays." },
                  { label: "Immutable Audit Trail", desc: "Every broadcast, response, and timestamp is SHA-256 hashed. Tamper-proof evidence available on request — court admissible." },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-slate-900 font-black text-sm mb-1" dangerouslySetInnerHTML={{ __html: label }} />
                      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <a href="/register"
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black px-7 py-3.5 rounded-xl text-sm mt-8 transition-colors no-underline">
                Activate Emergency Protection <IcoArrow />
              </a>
            </div>

            {/* Right — Emergency response card */}
            <div className="flex-shrink-0 w-full max-w-xs">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                {/* Alert header */}
                <div className="bg-red-600 px-5 py-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-white text-xs font-black tracking-widest uppercase">Emergency Active</span>
                  </div>
                  <p className="text-red-100 text-xs">Main Campus &middot; Sofia's Dance Academy</p>
                </div>
                {/* Status grid */}
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <p className="text-emerald-700 text-3xl font-black leading-none">12</p>
                      <p className="text-emerald-600 text-xs font-bold uppercase tracking-wide mt-1">Confirmed Safe</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                      <p className="text-red-600 text-3xl font-black leading-none">3</p>
                      <p className="text-red-500 text-xs font-bold uppercase tracking-wide mt-1">Need Help</p>
                    </div>
                  </div>
                  {/* Response buttons */}
                  <div className="bg-emerald-500 rounded-xl py-3 text-center mb-2">
                    <span className="text-white font-black text-sm">We Are Safe</span>
                  </div>
                  <div className="bg-red-600 rounded-xl py-3 text-center">
                    <span className="text-white font-black text-sm">Need Assistance</span>
                  </div>
                  <p className="text-slate-400 text-[11px] text-center mt-3 leading-relaxed">
                    Stride Emergency Protocol &middot; SHA-256 Verified<br />
                    Forced delivery &mdash; bypasses silent mode
                  </p>
                </div>
              </div>
              <p className="text-center text-slate-400 text-xs mt-3">Actual member Emergency Pulse screen</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR MEMBERS ────────────────────────────────────────────────────── */}
      <section id="for-members" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row items-center gap-16">

            {/* Left — copy */}
            <div className="flex-1">
              <span className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 mb-5">
                <span className="text-amber-700 text-xs font-bold tracking-wider uppercase">For Members</span>
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
                Your Dependants, Always in Safe Hands
              </h2>
              <p className="text-lg text-slate-500 mb-8 leading-relaxed">
                Stride gives members full visibility and control — from drop-off to pick-up confirmation.
                No more uncertainty. No more missed messages.
              </p>

              <div className="space-y-6">
                {PARENT_FEATURES.map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 text-[#1E3A8A] flex items-center justify-center flex-shrink-0">
                      {icon}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <a href="/register"
                  className="inline-flex items-center gap-2 bg-[#D4AF37] text-[#0A192F] font-black px-7 py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors no-underline shadow-md shadow-amber-100">
                  Join as a Member <IcoArrow />
                </a>
              </div>
            </div>

            {/* Right — Member portal card */}
            <div className="flex-shrink-0 w-full max-w-sm">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                <div className="bg-[#1E3A8A] px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Member Portal</p>
                    <p className="text-blue-300 text-xs">Sofia's School &mdash; Live</p>
                  </div>
                  <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="px-5 py-4 space-y-3">
                  {[
                    { label: "Sofia checked in",          time: "3:01 PM",   color: "bg-emerald-400" },
                    { label: "Pickup: Mum (authorised)",  time: "5:30 PM",   color: "bg-blue-400" },
                    { label: "Waiver signed",             time: "Yesterday", color: "bg-violet-400" },
                  ].map(({ label, time, color }) => (
                    <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />
                      <span className="text-slate-800 text-sm flex-1">{label}</span>
                      <span className="text-slate-400 text-xs">{time}</span>
                    </div>
                  ))}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <div>
                      <p className="text-amber-700 text-xs font-bold">Emergency Pulse Active</p>
                      <p className="text-amber-600 text-xs">Tap to acknowledge school alert</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="bg-[#1E3A8A] py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">How It Works</h2>
          <p className="text-blue-200 text-lg max-w-xl mx-auto">From signup to first check-in in under 24 hours.</p>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          {HOW_STEPS.map(({ n, title, desc }) => (
            <div key={n} className="bg-white/8 border border-white/15 rounded-2xl p-8">
              <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center mb-5">
                <span className="text-[#D4AF37] font-black text-lg">{n}</span>
              </div>
              <h3 className="text-white font-black text-xl mb-3">{title}</h3>
              <p className="text-blue-200 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-10 text-center">
          <a href="/register"
            className="inline-flex items-center gap-2 bg-[#D4AF37] text-[#0A192F] font-black px-8 py-4 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors no-underline shadow-md">
            Start Your Free Trial <IcoArrow />
          </a>
        </div>
      </section>

      {/* ── PRIVACY BY DESIGN ──────────────────────────────────────────────── */}
      <section id="privacy" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          <div className="text-center mb-14">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 mb-6 mx-auto">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <span className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-700 text-xs font-bold tracking-wider uppercase">Designed With Your Data In Mind</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">Privacy by Design</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              How we protect your data — and your child's.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
            {PRIVACY_PILLARS.map(({ title, badge, desc, badgeColor, iconColor, icon }) => (
              <div key={title} className="bg-white border border-slate-200 rounded-2xl p-7 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0 ${iconColor}`}>
                    {icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-slate-900 font-black text-base">{title}</h3>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
                    </div>
                    <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trust bar */}
          <div className="bg-white border border-slate-200 rounded-2xl px-8 py-5 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12">
            {[
              { color: "text-emerald-600", label: "AES-256 at rest & in transit" },
              { color: "text-blue-600",    label: "GDPR \u00B7 CCPA \u00B7 UK GDPR" },
              { color: "text-violet-600",  label: "No third-party data sharing" },
              { color: "text-amber-600",   label: "Full audit export on request" },
            ].map(({ color, label }) => (
              <div key={label} className={`flex items-center gap-2 text-sm font-medium ${color}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/20 rounded-full px-4 py-1.5 mb-5">
              <span className="text-[#1E3A8A] text-xs font-bold tracking-wider uppercase">Transparent Pricing</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">Pay Per QR Code. Nothing Else.</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              No flat fees, no platform cuts on member payments, no hidden charges. Volume discounts apply automatically.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8">
            {/* Currency */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm font-bold text-slate-700">Currency</p>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["AUD", "EUR", "USD"] as CurrencyKey[]).map(c => (
                  <button key={c} onClick={() => setCurrency(c)}
                    className={`px-4 py-1.5 text-xs font-bold transition-colors ${currency === c ? "bg-[#1E3A8A] text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Slider */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-slate-700">
                  Active QR codes: <span className="text-[#1E3A8A]">{qrCodes}</span>
                </p>
                <p className="text-xs text-slate-400">members + operators + kiosks</p>
              </div>
              <input type="range" min={10} max={500} step={5} value={qrCodes}
                onChange={e => setQrCodes(Number(e.target.value))}
                className="w-full accent-[#1E3A8A]" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>10</span><span>100</span><span>300</span><span>500</span>
              </div>
            </div>

            {/* Result */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-white rounded-xl p-5 text-center border border-slate-200">
                <p className="text-3xl font-black text-[#1E3A8A]">{sym}{total}</p>
                <p className="text-xs text-slate-500 mt-1">per month</p>
              </div>
              <div className="bg-white rounded-xl p-5 text-center border border-slate-200">
                <p className="text-3xl font-black text-slate-700">{sym}{perQR}</p>
                <p className="text-xs text-slate-500 mt-1">per QR / month</p>
              </div>
              <div className="bg-white rounded-xl p-5 text-center border border-slate-200">
                {saved ? (
                  <>
                    <p className="text-3xl font-black text-emerald-600">{sym}{saved}</p>
                    <p className="text-xs text-slate-500 mt-1">volume saving</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-black text-slate-400">--</p>
                    <p className="text-xs text-slate-500 mt-1">no discount yet</p>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-6">
              {[
                ["First 100 QRs", `${sym}${(1.20 * fx).toFixed(2)} each`],
                ["101\u2013300 QRs", `${sym}${(1.05 * fx).toFixed(2)} each`],
                ["301+ QRs",      `${sym}${(0.90 * fx).toFixed(2)} each`],
              ].map(([tier, price]) => (
                <div key={tier} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3">
                  <span className="text-emerald-500"><IcoCheck /></span>
                  <span className="text-slate-700 font-medium">{tier}</span>
                  <span className="ml-auto text-[#1E3A8A] font-bold">{price}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 text-center">
              Authorised pick-up contacts are always free. 30-day free trial with no credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-slate-500 text-lg">Still unsure? Everything you need to know.</p>
          </div>

          <div className="space-y-3">
            {FAQS.map(({ q, a }, i) => (
              <div key={q} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left gap-4">
                  <span className="text-slate-900 font-bold text-sm sm:text-base">{q}</span>
                  <span className="text-slate-400 flex-shrink-0"><IcoChevron open={openFaq === i} /></span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-slate-500 text-sm leading-relaxed">{a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────────────────── */}
      <section className="py-24 bg-[#1E3A8A]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#D4AF37]/15 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            <span className="text-[#D4AF37] text-xs font-bold tracking-wider uppercase">Join 500+ Schools on Stride</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-5">
            Your Free Trial Starts the Moment You Sign Up
          </h2>
          <p className="text-blue-200 text-lg mb-8 leading-relaxed">
            No credit card. No commitment. Full access for 30 days.<br />
            Set up your school, invite your operators, and run your first safe session today.
          </p>
          <a href="/register"
            className="inline-flex items-center gap-2.5 bg-[#D4AF37] text-[#0A192F] font-black text-lg px-10 py-5 rounded-2xl hover:bg-[#e8c44b] transition-colors shadow-xl shadow-[#D4AF37]/20 no-underline">
            Start Free Trial &mdash; No Card Required <IcoArrow />
          </a>
          <p className="mt-5 text-blue-400 text-sm">
            Questions?{" "}
            <a href="/contact" className="text-blue-200 hover:text-white underline">Talk to our team</a>{" "}
            &mdash; we reply within 24 hours.
          </p>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0d1a3e]">
        <div className="border-b border-white/8 py-4">
          <TrustBadge className="max-w-7xl mx-auto px-4 sm:px-6 justify-center" />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 no-underline">
            <Logo />
            <span className="font-bold text-white">Stride Platform</span>
          </a>
          <span className="text-blue-400 text-xs text-center">
            &copy; {new Date().getFullYear()} Stride Platform &mdash; All transactions secured by Stripe.
          </span>
          <div className="flex gap-5 text-xs text-blue-300">
            <a href="/privacy" className="hover:text-white transition-colors no-underline">Privacy</a>
            <a href="/terms"   className="hover:text-white transition-colors no-underline">Terms</a>
            <a href="/contact" className="hover:text-white transition-colors no-underline">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
