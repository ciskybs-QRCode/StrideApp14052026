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

const ASSOC_FEATURES = [
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
    desc: "Define exactly who can collect each dependant. Unauthorised pickup attempts trigger an immediate alert to association operators.",
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

const MEMBER_FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
    title: "Real-Time Check-In Alerts",
    desc: "A push notification the moment your dependent member scans in — with the name of the operator who acknowledged them.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    title: "Authorised Pickup Control",
    desc: "Add or revoke pickup contacts from your phone, anytime. Every change is logged — no-one can release your dependent member without your approval.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Emergency Pulse Alerts",
    desc: "Associations broadcast emergency alerts to all member phones simultaneously. One-tap acknowledgment confirms receipt — bypasses silent mode.",
  },
];

const HOW_STEPS = [
  {
    n: "01",
    title: "Association signs up in minutes",
    desc: "Register your association, configure your schedule, and invite your operators — all in one setup flow. No IT team required.",
  },
  {
    n: "02",
    title: "Members sign documents on their phones",
    desc: "Members receive an invite link, review all consent documents, and sign digitally before their first session.",
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
    desc: "Wearable UUIDs are randomly generated anonymous identifiers. They contain NO member name or personal info — only the secure portal can link them.",
    badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
    iconColor: "text-violet-600",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: "Full Member Control",
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
    a: "Each association's data is in a fully isolated tenant environment. Cross-tenant access is architecturally impossible. All traffic is encrypted in transit (TLS 1.3) and at rest (AES-256).",
  },
  {
    q: "Can I manage multiple venues or class types?",
    a: "Yes. Multi-location architecture is natively supported. Create separate schedules, staff pools, and attendance rosters per venue — all under one admin account.",
  },
];

// ── Inline icons ──────────────────────────────────────────────────────────────

const IcoArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);
const IcoCheck = ({ gold }: { gold?: boolean } = {}) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={gold ? "#FBBF24" : "currentColor"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
  <img src="/stride-logo.png" alt="Stride" style={{ height: 44, width: "auto", display: "block" }} />
);

// ── Stat counters ─────────────────────────────────────────────────────────────

const STATS = [
  { n: "30 days", label: "Free trial — no card" },
  { n: "<60 s",   label: "Full setup time" },
  { n: "<3 s",    label: "Emergency Pulse delivery" },
  { n: "0%",      label: "Platform commission" },
];

// ── Component ─────────────────────────────────────────────────────────────────

// ── Currency detection + live rates ──────────────────────────────────────────

const USD_PRICES = { core: 49, plus: 99, premium: 199 };
const SYM: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", AUD: "A$", CAD: "CA$", CHF: "CHF ", JPY: "¥",
};

function fmtPrice(usd: number, currency: string, rates: Record<string, number>): string {
  const sym = SYM[currency] ?? (currency + " ");
  if (currency === "USD" || !rates[currency]) return `$${usd}`;
  const local = Math.round(usd * rates[currency]);
  return `${sym}${local.toLocaleString()}`;
}

export default function Landing() {
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [openFaq,   setOpenFaq]   = useState<number | null>(null);
  const [currency,  setCurrency]  = useState("USD");
  const [rates,     setRates]     = useState<Record<string, number>>({});

  type Review = {
    id: number; name: string; role: string; association_name: string;
    member_count: number | null; rating: number; comment: string; created_at: string;
  };
  const [reviews,       setReviews]       = useState<Review[]>([]);
  const [showForm,      setShowForm]      = useState(false);
  const [formRating,    setFormRating]    = useState(0);
  const [formHover,     setFormHover]     = useState(0);
  const [formName,      setFormName]      = useState("");
  const [formRole,      setFormRole]      = useState("");
  const [formAssoc,     setFormAssoc]     = useState("");
  const [formMembers,   setFormMembers]   = useState("");
  const [formComment,   setFormComment]   = useState("");
  const [formSending,   setFormSending]   = useState(false);
  const [formSuccess,   setFormSuccess]   = useState(false);
  const [formError,     setFormError]     = useState("");

  // 1. IP geolocation → currency (no permission required)
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then(r => r.json())
      .then((d: { currency?: string }) => { if (d.currency) setCurrency(d.currency); })
      .catch(() => {
        // Fallback: timezone-based detection
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
          if (tz.startsWith("Europe/London"))  { setCurrency("GBP"); return; }
          if (tz.startsWith("Europe/"))        { setCurrency("EUR"); return; }
          if (tz.startsWith("Australia/"))     { setCurrency("AUD"); return; }
          if (tz.startsWith("America/"))       { setCurrency("USD"); return; }
        } catch { /* keep USD */ }
      });
  }, []);

  // 2. Fetch live exchange rates (USD base)
  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r => r.json())
      .then((d: { rates?: Record<string, number> }) => { if (d.rates) setRates(d.rates); })
      .catch(() => { /* keep empty — will show USD */ });
  }, []);

  // 3. Fetch approved reviews
  useEffect(() => {
    fetch("/api/reviews")
      .then(r => r.json())
      .then((data: Review[]) => { if (Array.isArray(data)) setReviews(data); })
      .catch(() => {});
  }, []);

  async function submitReview(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (formRating === 0) { setFormError("Please choose a star rating."); return; }
    if (formComment.trim().length < 20) { setFormError("Review must be at least 20 characters."); return; }
    setFormSending(true);
    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName, role: formRole, association_name: formAssoc,
          member_count: formMembers ? parseInt(formMembers) : null,
          rating: formRating, comment: formComment,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setFormError(json.error ?? "Submission failed."); return; }
      setFormSuccess(true);
      setShowForm(false);
      setFormRating(0); setFormName(""); setFormRole(""); setFormAssoc("");
      setFormMembers(""); setFormComment("");
    } catch {
      setFormError("Network error — please try again.");
    } finally {
      setFormSending(false);
    }
  }

  const navLinks = [
    ["#for-associations", "For Associations"],
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
          <a href="/" className="flex items-center no-underline">
            <Logo />
          </a>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(([href, label]) => (
              <a key={label} href={href}
                className="text-sm text-slate-600 hover:text-[#1E3A8A] font-medium transition-colors no-underline">
                {label}
              </a>
            ))}
            <a href="/join?signin=1"
              className="text-sm text-[#1E3A8A] font-semibold px-4 py-2.5 rounded-lg border border-[#1E3A8A]/30 hover:border-[#1E3A8A] hover:bg-[#1E3A8A]/5 transition-colors no-underline">
              Sign In
            </a>
            <a href="/register"
              className="bg-[#FBBF24] text-[#0A192F] text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-[#fcd34d] transition-colors no-underline">
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
            <a href="/join?signin=1"
              className="text-[#1E3A8A] text-sm font-semibold px-5 py-3 rounded-lg border border-[#1E3A8A]/30 text-center no-underline"
              onClick={() => setMenuOpen(false)}>
              Sign In
            </a>
            <a href="/register"
              className="bg-[#FBBF24] text-[#0A192F] text-sm font-bold px-5 py-3 rounded-lg text-center no-underline"
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
              <span className="text-[#1E3A8A]">Associations &amp; Activity Organisations.</span>
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
                className="inline-flex items-center justify-center gap-2 bg-[#FBBF24] text-[#0A192F] font-black px-8 py-4 rounded-xl text-base hover:bg-[#fcd34d] transition-colors shadow-md shadow-amber-100 no-underline">
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-sm font-bold">Stride Kiosk — Live</p>
                  <p className="text-blue-300 text-xs">City Sports Club</p>
                </div>
                <span className="ml-auto flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
                </span>
              </div>
              {/* Attendance list */}
              <div className="px-5 py-4 space-y-2.5">
                {[
                  ["Alex T.",   "Checked in",  true],
                  ["Sam K.",    "Checked in",  true],
                  ["Jordan L.", "Pending",      false],
                  ["Chris M.",  "Checked in",  true],
                  ["Riley P.",  "Absent",       false],
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
                <span className="bg-[#FBBF24]/15 text-[#9a7d00] text-xs font-bold px-3 py-1 rounded-full border border-[#FBBF24]/30">QR Active</span>
              </div>
            </div>

            {/* Product guarantees below card */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { n: "30 days", label: "Free trial" },
                { n: "<60 s",   label: "Full setup" },
                { n: "0%",      label: "Commission" },
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

      {/* ── DEMO VIDEO TEASER ──────────────────────────────────────────────── */}
      <section className="bg-slate-50 border-b border-slate-100 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <a href="/marketing/promo-video" target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 w-28 h-18 sm:w-36 sm:h-22 bg-[#1E3A8A] rounded-2xl flex items-center justify-center group no-underline" style={{ minWidth: 120, minHeight: 72 }}>
              <div className="w-12 h-12 rounded-full bg-[#FBBF24] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#1E3A8A" stroke="none">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
            </a>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">2-Minute Product Demo</p>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-1">See Stride turn paper chaos into a safe, digital operation</h3>
              <p className="text-sm text-slate-500 leading-relaxed">From sign-in sheet to QR kiosk. From phone tree to Emergency Pulse. Watch the transformation.</p>
            </div>
            <a href="/marketing/promo-video" target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 inline-flex items-center gap-2 bg-[#1E3A8A] text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-[#152d6e] transition-colors no-underline">
              Watch Demo <IcoArrow />
            </a>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────────────── */}
      <div className="bg-[#1E3A8A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map(({ n, label }) => (
            <div key={label}>
              <div className="text-3xl font-black text-[#FBBF24]">{n}</div>
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

          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full stride-table text-sm min-w-[560px]">
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
                  <th className="text-left font-bold text-[13px] uppercase tracking-wider text-[#FBBF24]">
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[#FBBF24]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
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

      {/* ── WHY NOT ALTERNATIVES ───────────────────────────────────────────── */}
      <section className="py-20 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-4 py-1.5 mb-5">
              <span className="text-slate-600 text-xs font-bold tracking-wider uppercase">Why not the alternatives?</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Stride is built for associations with dependants.<br className="hidden sm:block" /> Others aren't.
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Generic membership tools handle subscriptions. Stride handles safety, compliance, verified pick-up, and crisis communication — the things that matter when real people are involved.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
            {[
              {
                name: "Wild Apricot / TeamApp",
                icon: "⚠️",
                color: "border-amber-200 bg-amber-50",
                badge: "bg-amber-100 text-amber-700",
                badgeText: "Generic Platform",
                cons: [
                  "No verified pick-up or Guardian Circle",
                  "No Emergency Pulse to families",
                  "No SHA-256 audit trail for incidents",
                  "No operator QR kiosk",
                  "No AI absence & rescue cascade",
                ],
              },
              {
                name: "WhatsApp + Spreadsheets",
                icon: "❌",
                color: "border-red-200 bg-red-50",
                badge: "bg-red-100 text-red-700",
                badgeText: "Manual & Risky",
                cons: [
                  "No record of who picked up whom",
                  "No immutable attendance log",
                  "Zero legal compliance infrastructure",
                  "No emergency broadcast system",
                  "Admin spends 10+ hrs/week on paperwork",
                ],
              },
              {
                name: "Stride",
                icon: "✅",
                color: "border-[#1E3A8A] bg-[#1E3A8A]/3",
                badge: "bg-[#1E3A8A] text-white",
                badgeText: "Purpose-Built",
                cons: [
                  "Guardian Circle: QR-verified pick-up",
                  "Emergency Pulse: forced alert in &lt;3 s",
                  "SHA-256 audit trail on every event",
                  "QR kiosk + operator mobile dashboard",
                  "AI roster, payroll & compliance built-in",
                ],
                highlight: true,
              },
            ].map(alt => (
              <div key={alt.name} className={`rounded-2xl border-2 p-6 ${alt.color} ${alt.highlight ? "shadow-lg" : ""}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{alt.icon}</span>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${alt.badge}`}>{alt.badgeText}</span>
                    <p className="text-slate-900 font-black text-sm mt-1">{alt.name}</p>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {alt.cons.map(c => (
                    <li key={c} className={`flex items-start gap-2 text-xs leading-relaxed ${alt.highlight ? "text-slate-700 font-medium" : "text-slate-500"}`}>
                      <span className="mt-0.5 flex-shrink-0">{alt.highlight ? "✓" : "✗"}</span>
                      <span dangerouslySetInnerHTML={{ __html: c }} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR ASSOCIATIONS ──────────────────────────────────────────────── */}
      <section id="for-associations" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/20 rounded-full px-4 py-1.5 mb-5">
              <span className="text-[#1E3A8A] text-xs font-bold tracking-wider uppercase">For Associations &amp; Organisations</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Everything You Need to Run Safely
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              One platform replaces attendance sheets, paper waivers, cash payroll, and six different apps.
            </p>
            <div className="inline-flex items-center gap-2 mt-5 bg-[#FBBF24]/15 border border-[#FBBF24]/40 rounded-full px-5 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              <span className="text-[#92400E] text-sm font-bold">One account for multiple associations — switch between them with a single tap</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ASSOC_FEATURES.map(({ icon, tag, title, desc, accent }) => (
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
              Register Your Association <IcoArrow />
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
                  <p className="text-red-100 text-xs">Main Campus &middot; City Sports Club</p>
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
                {MEMBER_FEATURES.map(({ icon, title, desc }) => (
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
                  className="inline-flex items-center gap-2 bg-[#FBBF24] text-[#0A192F] font-black px-7 py-3.5 rounded-xl text-sm hover:bg-[#fcd34d] transition-colors no-underline shadow-md shadow-amber-100">
                  Join as a Member <IcoArrow />
                </a>
              </div>
            </div>

            {/* Right — Member portal card */}
            <div className="flex-shrink-0 w-full max-w-sm">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                <div className="bg-[#1E3A8A] px-5 py-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Member Portal</p>
                    <p className="text-blue-300 text-xs">City Sports Club &mdash; Live</p>
                  </div>
                  <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="px-5 py-4 space-y-3">
                  {[
                    { label: "Alex checked in",           time: "3:01 PM",   color: "bg-emerald-400" },
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <div>
                      <p className="text-amber-700 text-xs font-bold">Emergency Pulse Active</p>
                      <p className="text-amber-600 text-xs">Tap to acknowledge association alert</p>
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
              <div className="w-12 h-12 rounded-xl bg-[#FBBF24]/20 border border-[#FBBF24]/40 flex items-center justify-center mb-5">
                <span className="text-[#FBBF24] font-black text-lg">{n}</span>
              </div>
              <h3 className="text-white font-black text-xl mb-3">{title}</h3>
              <p className="text-blue-200 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-10 text-center">
          <a href="/register"
            className="inline-flex items-center gap-2 bg-[#FBBF24] text-[#0A192F] font-black px-8 py-4 rounded-xl text-sm hover:bg-[#fcd34d] transition-colors no-underline shadow-md">
            Start Your Free Trial <IcoArrow />
          </a>
        </div>
      </section>

      {/* ── REVIEWS ────────────────────────────────────────────────────────── */}
      <section id="reviews" className="py-24 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-14">
            <div>
              <span className="inline-flex items-center gap-2 bg-[#FBBF24]/15 border border-[#FBBF24]/40 rounded-full px-4 py-1.5 mb-5">
                <span className="text-[#9a7000] text-xs font-bold tracking-wider uppercase">Verified User Reviews</span>
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-3">What association leaders say</h2>
              <p className="text-slate-500 text-base max-w-xl">
                Every review here was submitted by a real Stride user and approved before publishing. No invented quotes, no stock photos.
              </p>
            </div>
            {!showForm && !formSuccess && (
              <button
                onClick={() => setShowForm(true)}
                className="flex-shrink-0 inline-flex items-center gap-2 bg-[#1E3A8A] text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-[#162d6e] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Leave a Review
              </button>
            )}
          </div>

          {/* Success banner */}
          {formSuccess && (
            <div className="mb-10 bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-emerald-800 font-bold text-sm">Review submitted — thank you!</p>
                <p className="text-emerald-700 text-sm mt-0.5">Your experience will appear here once approved, usually within 24 hours.</p>
              </div>
            </div>
          )}

          {/* Submission form */}
          {showForm && (
            <form onSubmit={submitReview} className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm mb-10">
              <h3 className="text-slate-900 font-black text-lg mb-6">Share your experience with Stride</h3>

              {/* Star rating */}
              <div className="mb-6">
                <p className="text-slate-700 text-sm font-semibold mb-3">Your rating *</p>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(star => (
                    <button key={star} type="button"
                      onClick={() => setFormRating(star)}
                      onMouseEnter={() => setFormHover(star)}
                      onMouseLeave={() => setFormHover(0)}
                      className="focus:outline-none"
                    >
                      <svg className={`w-8 h-8 transition-colors ${star <= (formHover || formRating) ? "text-[#FBBF24]" : "text-slate-300"}`} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-1.5">Your name *</label>
                  <input required value={formName} onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Marco R." maxLength={80}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]" />
                </div>
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-1.5">Your role *</label>
                  <input required value={formRole} onChange={e => setFormRole(e.target.value)}
                    placeholder="e.g. Director, Parent, Operator" maxLength={80}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]" />
                </div>
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-1.5">Association name *</label>
                  <input required value={formAssoc} onChange={e => setFormAssoc(e.target.value)}
                    placeholder="e.g. ASD Palestra Centrale" maxLength={120}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]" />
                </div>
                <div>
                  <label className="block text-slate-700 text-sm font-semibold mb-1.5">Number of members <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="number" min={1} max={50000} value={formMembers} onChange={e => setFormMembers(e.target.value)}
                    placeholder="e.g. 120"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]" />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-slate-700 text-sm font-semibold mb-1.5">Your review * <span className="text-slate-400 font-normal">(min 20 characters)</span></label>
                <textarea required value={formComment} onChange={e => setFormComment(e.target.value)}
                  rows={4} maxLength={1200}
                  placeholder="What changed for your association after using Stride? What do you like most? Anything you'd improve?"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A] resize-none" />
                <p className="text-slate-400 text-xs mt-1 text-right">{formComment.length}/1200</p>
              </div>

              {formError && (
                <p className="text-red-600 text-sm mb-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 flex-wrap">
                <button type="submit" disabled={formSending}
                  className="bg-[#1E3A8A] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#162d6e] disabled:opacity-60 transition-colors">
                  {formSending ? "Submitting…" : "Submit Review"}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="text-slate-500 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
              </div>
              <p className="text-slate-400 text-xs mt-4">Reviews are moderated before publishing. We verify that the reviewer is a real Stride user.</p>
            </form>
          )}

          {/* Reviews grid */}
          {reviews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.map(rv => {
                const initials = rv.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
                const colors = ["bg-[#1E3A8A]","bg-emerald-600","bg-violet-600","bg-amber-600","bg-sky-600"];
                const color = colors[rv.id % colors.length];
                return (
                  <div key={rv.id} className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm flex flex-col">
                    <div className="flex gap-1 mb-4">
                      {[1,2,3,4,5].map(s => (
                        <svg key={s} className={`w-4 h-4 ${s <= rv.rating ? "text-[#FBBF24]" : "text-slate-200"}`} fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed flex-1 mb-6">"{rv.comment}"</p>
                    <div className="flex items-center gap-3 pt-5 border-t border-slate-100">
                      <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center flex-shrink-0`}>
                        <span className="text-white text-xs font-black">{initials}</span>
                      </div>
                      <div>
                        <p className="text-slate-900 text-sm font-bold">{rv.name}</p>
                        <p className="text-slate-500 text-xs">{rv.role}</p>
                        <p className="text-[#1E3A8A] text-xs font-semibold">
                          {rv.association_name}{rv.member_count ? ` · ${rv.member_count} members` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty state — only shows when no approved reviews yet */
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-[#FBBF24]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-[#FBBF24]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <h3 className="text-slate-900 font-black text-xl mb-3">Be the first founding association to review Stride</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto mb-8">
                Stride is in early access. If you are using it, your honest experience helps other association leaders decide — and shapes what we build next.
              </p>
              {!showForm && !formSuccess && (
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 bg-[#1E3A8A] text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-[#162d6e] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Share your experience
                </button>
              )}
            </div>
          )}
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
              How we protect your data — and your members'.
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

      {/* ── LEGAL RESPONSIBILITY DISCLAIMER ──────────────────────────────── */}
      <section className="py-20 bg-red-50 border-y border-red-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 border-2 border-red-300 mb-5 mx-auto">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <span className="inline-flex items-center gap-2 bg-red-100 border border-red-300 rounded-full px-4 py-1.5 mb-4">
              <span className="text-red-700 text-xs font-bold tracking-wider uppercase">Important Legal Notice</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">
              Stride Does Not Cover <span className="text-red-600">Your Organisation</span>
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed">
              Stride provides software infrastructure. We are not a legal entity, insurer, or compliance provider for your association.
            </p>
          </div>

          {/* Car analogy */}
          <div className="bg-white border-2 border-red-200 rounded-2xl p-8 mb-8">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0 text-2xl">🚗</div>
              <div>
                <h3 className="text-lg font-black text-slate-900 mb-2">Think of Stride like a car manufacturer</h3>
                <p className="text-slate-600 leading-relaxed">
                  We build the vehicle. But an American driver, an Italian driver, an Australian driver and a driver from Mali all follow <strong>completely different rules</strong> — different road laws, speed limits, licensing requirements. We cannot know or be responsible for the rules in your jurisdiction.{" "}
                  <strong>You, the association, are the driver. The road rules are yours to follow.</strong>
                </p>
              </div>
            </div>
          </div>

          {/* What Stride does NOT cover */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {[
              { title: "Member Legal Agreements", desc: "Your members' Terms & Conditions, liability waivers, and membership contracts are your documents — not Stride's. You must upload your own." },
              { title: "Child Safeguarding", desc: "Compliance with child protection, safeguarding, and supervision laws in your country is entirely your organisation's responsibility." },
              { title: "Data Protection Laws", desc: "GDPR, CCPA, PDPA, or whichever data law applies in your jurisdiction — your organisation is the data controller. Stride is a processor." },
              { title: "Financial & Tax Obligations", desc: "Association membership fees, invoicing requirements, tax collection, and reporting obligations are your responsibility to manage." },
            ].map(item => (
              <div key={item.title} className="bg-white border border-red-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm mb-1">{item.title}</p>
                    <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* What you must do */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-7 mb-6">
            <h3 className="text-base font-black text-amber-900 mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              What you must do as an association using Stride
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "Upload your own Terms & Conditions",
                "Upload your membership waiver / liability release",
                "Obtain proper data consent from parents & members",
                "Comply with child safeguarding laws in your country",
                "Manage your tax and financial reporting obligations",
                "Consult your own legal counsel for compliance",
              ].map(item => (
                <div key={item} className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="text-sm text-amber-800 font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Final bold statement */}
          <div className="bg-red-900 rounded-2xl p-7 text-center">
            <p className="text-white text-base font-black leading-relaxed mb-2">
              Stride bears <span className="text-red-300">zero legal responsibility</span> for your association's compliance with any local, national, or international law.
            </p>
            <p className="text-red-200 text-sm">
              Associations that have not uploaded their own legal documents provide no legal agreement to their members through the Stride platform. This is entirely the association's risk, not Stride's.
            </p>
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/20 rounded-full px-4 py-1.5 mb-5">
              <span className="text-[#1E3A8A] text-xs font-bold tracking-wider uppercase">Transparent Pricing</span>
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4">Simple pricing for every size</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Flat monthly rate. No platform cuts. 2-month free trial — no card required.
            </p>
          </div>

          {/* Three plan cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-start">
            {/* Core */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <div className="bg-slate-50 px-6 py-6">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">🥉 Core</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-black text-slate-900">{fmtPrice(USD_PRICES.core, currency, rates)}</span>
                  <span className="text-sm pb-1.5 text-slate-400">/mo</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">Up to 35 members · 3 operators</p>
              </div>
              <div className="px-6 py-5 flex-1 flex flex-col">
                <ul className="space-y-2 mb-5 text-sm text-slate-600 flex-1">
                  {["QR check-in / check-out", "Absent-Without-Notice Safety Alert", "Smart Pick-Up + QR Guardian", "Emergency SOS broadcast", "Attendance logs & reports", "Digital document signing"].map(f => (
                    <li key={f} className="flex items-center gap-2"><IcoCheck />{f}</li>
                  ))}
                </ul>
                <a href="/register"
                  className="block text-center bg-[#1E3A8A] text-white font-bold text-sm py-3 rounded-xl hover:bg-[#1e3070] transition-colors no-underline">
                  Start Free Trial
                </a>
              </div>
            </div>

            {/* Plus — most popular */}
            <div className="relative bg-white border-2 border-[#1E3A8A] rounded-2xl overflow-hidden shadow-xl shadow-[#1E3A8A]/15 flex flex-col scale-[1.03]">
              <div className="absolute top-4 right-4 bg-[#FBBF24] text-[#0A192F] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                ★ Most Popular
              </div>
              <div className="bg-[#1E3A8A] px-6 py-6">
                <p className="text-xs font-black uppercase tracking-widest text-blue-300 mb-1">🥈 Plus</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-black text-white">{fmtPrice(USD_PRICES.plus, currency, rates)}</span>
                  <span className="text-sm pb-1.5 text-blue-200">/mo</span>
                </div>
                <p className="text-xs text-blue-200 mt-2">Up to 100 members · 10 operators</p>
              </div>
              <div className="px-6 py-5 flex-1 flex flex-col">
                <ul className="space-y-2 mb-5 text-sm text-slate-600 flex-1">
                  {["Everything in Core", "Payroll (wages + contractor)", "Course booking + marketplace", "Event ticketing", "Advanced messaging"].map(f => (
                    <li key={f} className="flex items-center gap-2"><IcoCheck />{f}</li>
                  ))}
                </ul>
                <a href="/register"
                  className="block text-center bg-[#FBBF24] text-[#0A192F] font-black text-sm py-3 rounded-xl hover:bg-[#fcd34d] transition-colors no-underline">
                  Get Started
                </a>
              </div>
            </div>

            {/* Premium */}
            <div className="bg-white border-2 border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <div className="bg-slate-900 px-6 py-6">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">🥇 Premium</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-black text-white">{fmtPrice(USD_PRICES.premium, currency, rates)}</span>
                  <span className="text-sm pb-1.5 text-slate-400">/mo</span>
                </div>
                <p className="text-xs text-slate-400 mt-2">Unlimited members · Unlimited operators</p>
              </div>
              <div className="px-6 py-5 flex-1 flex flex-col">
                <ul className="space-y-2 mb-5 text-sm text-slate-600 flex-1">
                  {["Everything in Plus", "Full AI suite (6 AI features)", "BLE proximity auto check-in", "White-label branding + API access", "Global Pricing Engine"].map(f => (
                    <li key={f} className="flex items-center gap-2"><IcoCheck gold />{f}</li>
                  ))}
                </ul>
                <a href="/register"
                  className="block text-center bg-[#1E3A8A] text-white font-bold text-sm py-3 rounded-xl hover:bg-[#1e3070] transition-colors no-underline">
                  Get Started
                </a>
              </div>
            </div>
          </div>

          {/* Currency note + full comparison link */}
          <div className="text-center space-y-3">
            <p className="text-xs text-slate-400">
              {currency !== "USD"
                ? <>Prices shown in <strong className="text-slate-600">{currency}</strong> — estimated from live rates. All charges billed in USD. </>
                : "Prices in USD · "}
              Annual plans save 2 months (≈17% off) · Live local currency on the{" "}
              <a href="/pricing" className="text-[#1E3A8A] font-semibold hover:underline">full pricing page</a>.
            </p>
            <a href="/pricing"
              className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 font-bold text-sm px-6 py-3 rounded-xl hover:bg-slate-200 transition-colors no-underline">
              See full feature comparison &amp; local pricing <IcoArrow />
            </a>
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
          <div className="inline-flex items-center gap-2 bg-[#FBBF24]/15 border border-[#FBBF24]/30 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#FBBF24] animate-pulse" />
            <span className="text-[#FBBF24] text-xs font-bold tracking-wider uppercase">Early Access — Founding Associations Only</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-5">
            Your Free Trial Starts the Moment You Sign Up
          </h2>
          <p className="text-blue-200 text-lg mb-8 leading-relaxed">
            No credit card. No commitment. Full access for 30 days.<br />
            Set up your association, invite your operators, and run your first safe session today.
          </p>
          <a href="/register"
            className="inline-flex items-center gap-2.5 bg-[#FBBF24] text-[#0A192F] font-black text-lg px-10 py-5 rounded-2xl hover:bg-[#fcd34d] transition-colors shadow-xl shadow-[#FBBF24]/20 no-underline">
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
