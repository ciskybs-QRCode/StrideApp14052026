import { useState } from "react";
import { Route, Switch } from "wouter";
import Register from "./pages/Register";
import Activate from "./pages/Activate";

// ── Inline SVG Icons ──────────────────────────────────────────────────────────

const IconQR = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
  </svg>
);

const IconShield = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const IconBell = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);

const IconCard = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
      d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const Logo = () => (
  <svg height="34" width="34" viewBox="0 0 36 36" fill="none" aria-hidden>
    <rect width="36" height="36" rx="9" fill="#D4AF37" fillOpacity="0.18" />
    <path d="M9 18h18M18 10l8 8-8 8" stroke="#D4AF37" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Data ─────────────────────────────────────────────────────────────────────

const PAIN_CARDS = [
  {
    emoji: "📋",
    title: "Attendance Chaos",
    desc: "Lost paper logbooks, endless roll calls, and zero real-time tracking. Every session starts five minutes late while the teacher hunts for the clipboard.",
    border: "border-red-500/30",
    badge: "bg-red-500/10 text-red-400",
  },
  {
    emoji: "💸",
    title: "Staff Payroll Nightmares",
    desc: "Wasting hours manually matching hours, absences, and last-minute class covers at month-end. One miscalculation and trust breaks down overnight.",
    border: "border-orange-500/30",
    badge: "bg-orange-500/10 text-orange-400",
  },
  {
    emoji: "⚖️",
    title: "Untracked Liability",
    desc: "Liability waivers and image consents left unsigned, exposing your organisation to heavy compliance risks and potential litigation.",
    border: "border-yellow-500/30",
    badge: "bg-yellow-500/10 text-yellow-400",
  },
  {
    emoji: "🔗",
    title: "SaaS Middlemen Tax",
    desc: "Software platforms locking you into monthly fixed contracts and taking a percentage cut from your hard-earned member fees. Every single month.",
    border: "border-purple-500/30",
    badge: "bg-purple-500/10 text-purple-400",
  },
];

const PILLARS = [
  {
    Icon: IconQR,
    title: "Locked-Down Kiosk",
    tag: "Smart Check-In",
    desc: "Drop an iPad at the door. Members scan their unique QR code, instantly marking attendance and updating the teacher's roster. Secure, simple, and tamper-proof.",
  },
  {
    Icon: IconShield,
    title: "High-Security Legal Gate",
    tag: "Zero-Liability",
    desc: "Enforce digital signature compliance for terms, privacy policies, and media releases directly on the parent's smartphone before they access the platform.",
  },
  {
    Icon: IconBell,
    title: "Substitution Cascade",
    tag: "Auto-Dispatch",
    desc: "When an instructor reports an absence, the backend triggers a 5-minute rolling notification cascade to qualified backup staff, filling the slot with zero admin stress.",
  },
  {
    Icon: IconCard,
    title: "Stripe Connect Direct",
    tag: "0% Platform Fee",
    desc: "Connect your bank account. Member fees land directly into your school's balance. We take a 0% platform fee cut during your entire trial period.",
  },
];

const COMPLIANCE_REGIONS = [
  {
    flag: "🇦🇺",
    label: "AU Non-Profit",
    sub: "WA Cultural Associations",
    detail: "NFP-compliant invoicing, volunteer role differentiation, and state-level data residency for Western Australia regulations.",
    currency: "AUD",
  },
  {
    flag: "🇦🇺",
    label: "AU Commercial",
    sub: "ABN Studios & Gyms",
    detail: "Full ABN framework support, GST-inclusive pricing tiers, and TFND withholding automation for independent contractors.",
    currency: "AUD",
  },
  {
    flag: "🇪🇺",
    label: "EU Sportive",
    sub: "ASD / SSD Legal Entities",
    detail: "GDPR-native data handling, EUR billing, and compliance scaffolding for Italian and broader European ASD/SSD legal structures.",
    currency: "EUR",
  },
];

const FAQS = [
  {
    q: "Do I need to enter a credit card to start the trial?",
    a: "No. Complete and unrestricted access for 30 days, no strings attached. Your account activates instantly after registration with zero payment details required.",
  },
  {
    q: "What happens if an entrance kiosk tablet gets stolen?",
    a: "Instant protection. Use the Revoke Access button from your operator phone to force-logout and lock the device remotely. The stolen tablet loses all session access within seconds.",
  },
  {
    q: "Can I manage multiple venues or classes simultaneously?",
    a: "Yes, multi-location architecture is natively supported right out of the box. Create separate class schedules, staff pools, and attendance trackers per venue, all under one admin account.",
  },
  {
    q: "How does the per-seat pricing actually work?",
    a: "You pay only for active enrolled members each month. If a student unenrolls mid-month, they drop off your bill immediately. No flat fees, no surprise invoices, no minimum seat commitments.",
  },
  {
    q: "Is my members' data private and secure?",
    a: "Each school's data is stored in a fully isolated tenant environment. Cross-tenant data access is architecturally impossible. All traffic is encrypted in transit and at rest.",
  },
];

// ── Landing Page ─────────────────────────────────────────────────────────────

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [members, setMembers] = useState(50);
  const [currency, setCurrency] = useState<"AUD" | "EUR">("AUD");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const symbol = currency === "AUD" ? "A$" : "\u20AC";
  const monthlyTotal = (members * 1.5).toFixed(2);

  return (
    <div className="bg-[#0A1128] text-white min-h-screen overflow-x-hidden font-sans">

      {/* ─── NAVBAR ────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#0A1128]/96 backdrop-blur-md border-b border-[#D4AF37]/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 no-underline">
            <Logo />
            <span className="text-base font-bold text-white tracking-wide hidden sm:inline">Stride</span>
            <span className="hidden sm:inline text-[#D4AF37]/60 text-base font-light">Platform</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="#pain-points" className="text-sm text-slate-300 hover:text-[#D4AF37] transition-colors">Why Us</a>
            <a href="#features" className="text-sm text-slate-300 hover:text-[#D4AF37] transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-slate-300 hover:text-[#D4AF37] transition-colors">Pricing</a>
            <a href="#faq" className="text-sm text-slate-300 hover:text-[#D4AF37] transition-colors">FAQ</a>
            <a
              href="/register"
              className="bg-[#D4AF37] text-[#0A1128] text-sm font-bold px-5 py-2 rounded-lg hover:bg-[#e8c44b] transition-colors"
            >
              Start Free Trial
            </a>
          </div>

          <button
            className="md:hidden text-slate-300 p-1"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-[#D4AF37]/15 bg-[#0A1128] px-6 py-5 flex flex-col gap-4">
            {["#pain-points:Why Us", "#features:Features", "#pricing:Pricing", "#faq:FAQ"].map(item => {
              const [href, label] = item.split(":");
              return (
                <a key={label} href={href} className="text-sm text-slate-300 hover:text-[#D4AF37]"
                  onClick={() => setMenuOpen(false)}>{label}</a>
              );
            })}
            <a href="/register"
              className="bg-[#D4AF37] text-[#0A1128] text-sm font-bold px-5 py-3 rounded-lg text-center"
              onClick={() => setMenuOpen(false)}>
              Start Free Trial
            </a>
          </div>
        )}
      </nav>

      {/* ─── S1: HERO ──────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-20 pb-28">
        <div className="flex flex-col-reverse lg:flex-row items-center gap-14 lg:gap-20">

          {/* Copy */}
          <div className="flex-1 w-full text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-7">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse flex-shrink-0" />
              <span className="text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">Now in Early Access</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.1] text-white mb-6">
              Stop the Paperwork.{" "}
              <span className="text-[#D4AF37]">Manage Your Association, Dance Studio, or Gym</span>{" "}
              in One Single Platform.
            </h1>

            <p className="text-lg text-slate-400 leading-relaxed mb-4 max-w-2xl mx-auto lg:mx-0">
              From QR Code Kiosk check-ins and digital legal waivers to automated staff payroll.
              Everything streamlined, secure, and multi-tenant isolated.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mt-10">
              <a
                href="/register"
                className="inline-flex items-center justify-center gap-2 bg-[#D4AF37] text-[#0A1128] font-black px-8 py-4 rounded-xl text-base hover:bg-[#e8c44b] transition-colors shadow-[0_0_32px_rgba(212,175,55,0.3)]"
              >
                Start Your 30-Day Free Trial
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              No credit card required. Setup in 60 seconds.
            </p>
          </div>

          {/* Phone mockup */}
          <div className="flex-shrink-0">
            <div className="relative w-[230px] h-[460px] mx-auto">
              <div className="absolute inset-0 bg-[#D4AF37]/15 rounded-[3rem] blur-3xl scale-110" />
              <div className="relative w-full h-full bg-[#0d1a3e] border-[3px] border-[#D4AF37]/35 rounded-[3rem] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.7)] flex flex-col">
                <div className="w-24 h-6 bg-[#0A1128] rounded-b-2xl mx-auto flex-shrink-0" />
                <div className="flex-1 px-4 py-3 flex flex-col gap-2.5 overflow-hidden">
                  <div className="bg-[#D4AF37] rounded-xl h-9 flex items-center justify-center gap-2">
                    <div className="w-4 h-4 bg-[#0A1128]/30 rounded" />
                    <div className="w-20 h-2.5 bg-[#0A1128]/30 rounded-full" />
                  </div>
                  {[
                    ["Sofia R.", "Checked in", "✅"],
                    ["Marco B.", "Checked in", "✅"],
                    ["Anna K.", "Pending", "⏳"],
                    ["Luca M.", "Checked in", "✅"],
                    ["Giulia F.", "Absent", "❌"],
                  ].map(([name, status, icon]) => (
                    <div key={name} className="bg-[#1a2d56]/70 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#D4AF37]/20 flex items-center justify-center flex-shrink-0 text-xs">{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="h-2 bg-slate-300/50 rounded-full w-4/5 mb-1.5" />
                        <div className="h-1.5 bg-slate-600/40 rounded-full w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="w-20 h-1 bg-[#D4AF37]/30 rounded-full mx-auto mb-3 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="bg-[#D4AF37]/5 border-y border-[#D4AF37]/12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { n: "500+", label: "Schools Onboarded" },
            { n: "12k+", label: "Active Members" },
            { n: "99.9%", label: "Platform Uptime" },
            { n: "0%", label: "Commission on Trials" },
          ].map(({ n, label }) => (
            <div key={label}>
              <div className="text-3xl font-black text-[#D4AF37]">{n}</div>
              <div className="text-sm text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── S2: PAIN POINTS ───────────────────────────────────────────────── */}
      <section id="pain-points" className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">The Problem</div>
          <h2 className="text-3xl md:text-4xl font-black text-white">
            The Administrative Chaos<br className="hidden sm:block" /> Holding Your School Back
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Sound familiar? These are the four operational failures draining your time, money, and peace of mind.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PAIN_CARDS.map(({ emoji, title, desc, border, badge }) => (
            <div key={title}
              className={`bg-[#0d1a3e] border ${border} rounded-2xl p-7 flex gap-5 hover:brightness-110 transition-all`}>
              <div className={`w-12 h-12 rounded-xl ${badge} flex items-center justify-center text-2xl flex-shrink-0`}>
                {emoji}
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── S3: 4 PILLARS ─────────────────────────────────────────────────── */}
      <section id="features" className="bg-[#080f22] border-y border-[#D4AF37]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">The Solution</div>
            <h2 className="text-3xl md:text-4xl font-black text-white">
              4 Pillars That Replace<br className="hidden sm:block" /> Your Entire Admin Stack
            </h2>
            <p className="mt-4 text-slate-400 max-w-xl mx-auto">
              Each module is purpose-built for the specific realities of running a dance school, martial arts gym, or cultural association.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {PILLARS.map(({ Icon, title, tag, desc }) => (
              <div key={title}
                className="bg-[#0d1a3e] border border-[#D4AF37]/20 rounded-2xl p-7 flex flex-col hover:border-[#D4AF37]/50 transition-colors group">
                <div className="w-14 h-14 bg-[#D4AF37]/10 border border-[#D4AF37]/25 rounded-2xl flex items-center justify-center text-[#D4AF37] mb-5 group-hover:bg-[#D4AF37]/18 transition-colors flex-shrink-0">
                  <Icon />
                </div>
                <span className="text-xs font-semibold text-[#D4AF37] uppercase tracking-widest mb-2">{tag}</span>
                <h3 className="text-base font-bold text-white mb-3">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── S4: LOCALIZATION & COMPLIANCE ─────────────────────────────────── */}
      <section id="compliance" className="max-w-7xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">Compliance</div>
          <h2 className="text-3xl md:text-4xl font-black text-white">
            Built for Your Legal Framework,<br className="hidden sm:block" /> Not Against It
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Automated infrastructure adaptabilities for three distinct regulatory environments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {COMPLIANCE_REGIONS.map(({ flag, label, sub, detail, currency: cur }) => (
            <div key={label}
              className="bg-[#0d1a3e] border border-[#D4AF37]/20 rounded-2xl p-7 hover:border-[#D4AF37]/40 transition-colors">
              <div className="flex items-center gap-3 mb-5">
                <span className="text-4xl">{flag}</span>
                <div>
                  <div className="text-white font-bold">{label}</div>
                  <div className="text-xs text-slate-500">{sub}</div>
                </div>
                <span className="ml-auto text-xs font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/25 px-2.5 py-1 rounded-full">
                  {cur}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-2xl px-7 py-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="text-3xl flex-shrink-0">🌍</div>
          <div>
            <div className="text-white font-bold mb-1">Multi-currency billing is automatic</div>
            <div className="text-sm text-slate-400">
              Invoice currency follows your region. AUD for Australian entities, EUR for European ones. No manual conversion, no FX surprises.
            </div>
          </div>
          <a href="/register"
            className="flex-shrink-0 sm:ml-auto bg-[#D4AF37] text-[#0A1128] font-bold px-6 py-3 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors whitespace-nowrap">
            Get Started Free
          </a>
        </div>
      </section>

      {/* ─── S5: PRICING SLIDER ────────────────────────────────────────────── */}
      <section id="pricing" className="bg-[#080f22] border-y border-[#D4AF37]/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-24">
          <div className="text-center mb-14">
            <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">Pricing</div>
            <h2 className="text-3xl md:text-4xl font-black text-white">
              Pay Only for Active Members.
            </h2>
            <p className="mt-4 text-slate-400 max-w-xl mx-auto">
              No flat monthly fees. No minimum seats. No platform commission. The moment a member unenrolls, you stop paying for them.
            </p>
          </div>

          {/* Card */}
          <div className="bg-[#0d1a3e] border border-[#D4AF37]/30 rounded-3xl p-8 sm:p-10">

            {/* Free trial badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 bg-[#D4AF37]/15 border border-[#D4AF37]/40 rounded-full px-5 py-2">
                <span className="text-[#D4AF37] text-lg">🎉</span>
                <span className="text-[#D4AF37] font-bold text-sm">First 30 days: 100% Free. No credit card required.</span>
              </div>
            </div>

            {/* Currency toggle */}
            <div className="flex justify-center gap-2 mb-8">
              {(["AUD", "EUR"] as const).map(cur => (
                <button
                  key={cur}
                  onClick={() => setCurrency(cur)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                    currency === cur
                      ? "bg-[#D4AF37] text-[#0A1128]"
                      : "bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/25 hover:bg-[#D4AF37]/20"
                  }`}
                >
                  {cur === "AUD" ? "A$ AUD" : "\u20AC EUR"}
                </button>
              ))}
            </div>

            {/* Slider */}
            <div className="mb-8">
              <div className="flex justify-between text-xs text-slate-500 mb-3">
                <span>0 members</span>
                <span className="text-[#D4AF37] font-semibold text-sm">{members} active members</span>
                <span>500 members</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={1}
                value={members}
                onChange={e => setMembers(Number(e.target.value))}
                className="stride-slider w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #D4AF37 ${(members / 500) * 100}%, #1a2d56 ${(members / 500) * 100}%)`
                }}
              />
            </div>

            {/* Output */}
            <div className="text-center bg-[#0A1128] border border-[#D4AF37]/20 rounded-2xl px-6 py-7 mb-6">
              {members === 0 ? (
                <div>
                  <div className="text-4xl font-black text-white mb-2">
                    {symbol}0.00<span className="text-xl text-slate-400 font-normal">/mo</span>
                  </div>
                  <p className="text-slate-400 text-sm">You pay nothing with 0 active members.</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl sm:text-5xl font-black text-[#D4AF37] mb-2">
                    {symbol}{monthlyTotal}<span className="text-xl text-white font-normal">/mo</span>
                  </div>
                  <p className="text-slate-300 text-base leading-relaxed mt-2">
                    Have <span className="font-bold text-white">{members}</span> active members?{" "}
                    You only pay{" "}
                    <span className="font-bold text-[#D4AF37]">{symbol}{monthlyTotal}/month</span>.
                  </p>
                  <p className="text-slate-500 text-sm mt-2">
                    If a member unenrolls, you instantly stop paying for them.
                  </p>
                </div>
              )}
            </div>

            {/* Rate breakdown */}
            <div className="flex flex-col sm:flex-row gap-4 text-center">
              <div className="flex-1 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl px-4 py-4">
                <div className="text-[#D4AF37] font-black text-xl">{symbol}1.50</div>
                <div className="text-slate-400 text-xs mt-1">per active seat / month</div>
              </div>
              <div className="flex-1 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl px-4 py-4">
                <div className="text-[#D4AF37] font-black text-xl">0%</div>
                <div className="text-slate-400 text-xs mt-1">platform commission</div>
              </div>
              <div className="flex-1 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl px-4 py-4">
                <div className="text-[#D4AF37] font-black text-xl">30 days</div>
                <div className="text-slate-400 text-xs mt-1">completely free trial</div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <a href="/register"
                className="inline-flex items-center gap-2 bg-[#D4AF37] text-[#0A1128] font-black px-10 py-4 rounded-xl text-base hover:bg-[#e8c44b] transition-colors shadow-[0_0_32px_rgba(212,175,55,0.25)]">
                Activate Your Free 30 Days
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── S6: FAQ ───────────────────────────────────────────────────────── */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">FAQ</div>
          <h2 className="text-3xl md:text-4xl font-black text-white">Common Questions</h2>
          <p className="mt-4 text-slate-400">Everything you need to know before you start.</p>
        </div>

        <div className="flex flex-col gap-3">
          {FAQS.map(({ q, a }, i) => (
            <div key={i} className="bg-[#0d1a3e] border border-[#D4AF37]/20 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-[#D4AF37]/5 transition-colors"
              >
                <span className="font-semibold text-white text-sm sm:text-base">{q}</span>
                <span className="text-[#D4AF37]">
                  <IconChevron open={openFaq === i} />
                </span>
              </button>
              <div
                style={{
                  maxHeight: openFaq === i ? "200px" : "0",
                  overflow: "hidden",
                  transition: "max-height 0.3s ease",
                }}
              >
                <p className="px-6 pb-5 text-sm text-slate-400 leading-relaxed border-t border-[#D4AF37]/10 pt-4">
                  {a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── S7: FOOTER CTA + TERMINAL ─────────────────────────────────────── */}
      <footer className="border-t border-[#D4AF37]/15">

        {/* Terminal CTA band */}
        <div className="bg-[#0d1a3e]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
            <div className="inline-flex items-center gap-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse flex-shrink-0" />
              <span className="text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">Pioneer Access — Limited Slots</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
              Ready to Eliminate the<br className="hidden sm:block" />
              <span className="text-[#D4AF37]"> Administrative Chaos?</span>
            </h2>
            <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
              Join hundreds of schools already running cleaner, faster, and more profitable operations.
            </p>
            <a
              href="/register"
              className="inline-flex items-center gap-3 bg-[#D4AF37] text-[#0A1128] font-black px-10 py-5 rounded-xl text-lg hover:bg-[#e8c44b] transition-colors shadow-[0_0_60px_rgba(212,175,55,0.4)]"
            >
              Activate Your 30 Days Free Now
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </a>
            <p className="mt-5 text-sm text-slate-500">No credit card. No contracts. Cancel any time.</p>

            {/* SaaS trust badges */}
            <div className="flex flex-wrap justify-center gap-3 mt-10">
              {[
                { icon: "🔒", label: "SSL Encrypted" },
                { icon: "☁️", label: "99.9% Uptime SLA" },
                { icon: "💳", label: "Stripe Payments" },
                { icon: "🏢", label: "Multi-Tenant Isolated" },
                { icon: "🌍", label: "GDPR Compliant" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-slate-400">
                  <span>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-[#060e1e]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <a href="/" className="flex items-center gap-2 no-underline">
              <Logo />
              <span className="font-semibold text-slate-400">Stride</span>
            </a>
            <span>{"\u00A9"} {new Date().getFullYear()} Stride Platform. All rights reserved.</span>
            <div className="flex gap-5">
              <a href="#" className="hover:text-[#D4AF37] transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-[#D4AF37] transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-[#D4AF37] transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Switch>
      <Route path="/register" component={Register} />
      <Route path="/activate" component={Activate} />
      <Route component={Landing} />
    </Switch>
  );
}
