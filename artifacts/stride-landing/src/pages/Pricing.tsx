import { useState, useEffect, Fragment } from "react";
import { PageShell } from "../components/PageShell";

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan    = "core" | "plus" | "premium";
type Billing = "monthly" | "annual";

// ── Pricing data ──────────────────────────────────────────────────────────────

const PRICES: Record<Plan, { monthly: number; annual: number; accounts: string; operators: string }> = {
  core:    { monthly: 49,  annual: 490,  accounts: "Up to 100",   operators: "Up to 3" },
  plus:    { monthly: 99,  annual: 990,  accounts: "Up to 500",   operators: "Up to 10" },
  premium: { monthly: 199, annual: 1990, accounts: "Up to 2,000", operators: "Unlimited" },
};

// ── Feature comparison table ──────────────────────────────────────────────────

type CellVal = boolean | string;
interface FeatureRow { label: string; core: CellVal; plus: CellVal; premium: CellVal }
interface FeatureGroup { group: string; rows: FeatureRow[] }

const FEATURES: FeatureGroup[] = [
  {
    group: "Members & Access",
    rows: [
      { label: "Member accounts (billing unit)",          core: "Up to 100",   plus: "Up to 500",   premium: "Up to 2,000" },
      { label: "Children / dependants",                   core: "Unlimited",   plus: "Unlimited",   premium: "Unlimited" },
      { label: "Pick-up contacts",                        core: "Unlimited",   plus: "Unlimited",   premium: "Unlimited" },
      { label: "Operator accounts",                       core: "Up to 3",     plus: "Up to 10",    premium: "Unlimited" },
      { label: "Member portal (member + dependent view)", core: true,          plus: true,          premium: true },
      { label: "60-day free trial · no card required",    core: true,          plus: true,          premium: true },
    ],
  },
  {
    group: "Safety & Check-in",
    rows: [
      { label: "QR code check-in / check-out",                           core: true,  plus: true,  premium: true  },
      { label: "Attendance logging & reports",                            core: true,  plus: true,  premium: true  },
      { label: "Digital document signing (consent, waivers)",             core: true,  plus: true,  premium: true  },
      { label: "Smart Pick-Up (authorized guardian QR)",                  core: true,  plus: true,  premium: true  },
      { label: "QR Guardian (time windows, single-use codes)",            core: true,  plus: true,  premium: true  },
      { label: "Emergency SOS + crisis broadcast to all members",         core: true,  plus: true,  premium: true  },
      { label: "BLE proximity auto check-in (no QR scan needed)",         core: false, plus: false, premium: true  },
    ],
  },
  {
    group: "Operations",
    rows: [
      { label: "Broadcast messaging",                                     core: true,  plus: true,  premium: true  },
      { label: "Advanced messaging (attachments, read receipts)",         core: false, plus: true,  premium: true  },
      { label: "Course booking + waitlist management",                    core: false, plus: true,  premium: true  },
      { label: "Event ticketing (shows, performances, competitions)",      core: false, plus: false, premium: true  },
      { label: "Certificate tracking (medical, first aid + reminders)",   core: false, plus: true,  premium: true  },
      { label: "Operator scheduling + auto substitution (cascade)",       core: false, plus: true,  premium: true  },
      { label: "Multi-association (join with invite code)",               core: false, plus: true,  premium: true  },
    ],
  },
  {
    group: "Finance & Payroll",
    rows: [
      { label: "Stripe payments (memberships, lessons, fees)",            core: false, plus: true,  premium: true  },
      { label: "Marketplace (products, merchandise)",                     core: false, plus: true,  premium: true  },
      { label: "Contractor payroll + invoice PDF generation",             core: false, plus: true,  premium: true  },
      { label: "On-Wages payroll (leave, overtime, public holidays)",     core: false, plus: false, premium: true  },
      { label: "Digital employment contracts (AI-generated, signed)",     core: false, plus: false, premium: true  },
      { label: "Accountant payroll flow (scheduled authorized payments)", core: false, plus: false, premium: true  },
    ],
  },
  {
    group: "AI Features",
    rows: [
      { label: "AI medical certificate analysis (upload + auto-flag)",   core: false, plus: true,  premium: true  },
      { label: "AI Copilot (document & policy assistant)",               core: false, plus: false, premium: true  },
      { label: "AI Roster Optimizer + rescue cascade",                   core: false, plus: false, premium: true  },
      { label: "AI Jurisdiction & Contract Research (per country)",      core: false, plus: false, premium: true  },
      { label: "AI Deduction Editor (natural language payroll config)",  core: false, plus: false, premium: true  },
      { label: "AI Accountant Reply Parser (email → payroll config)",    core: false, plus: false, premium: true  },
    ],
  },
  {
    group: "Platform & Support",
    rows: [
      { label: "Analytics & reports",                                     core: "Basic",   plus: "Advanced", premium: "Custom" },
      { label: "White-label branding (logo, colors, name)",               core: false,     plus: false,      premium: true  },
      { label: "Global Pricing Engine (regional member rates)",           core: false,     plus: false,      premium: true  },
      { label: "API access (third-party integrations)",                   core: false,     plus: false,      premium: true  },
      { label: "Support",                                                  core: "Email",   plus: "Chat · 24h", premium: "Priority · 4h SLA" },
      { label: "Dedicated onboarding session",                            core: false,     plus: false,      premium: true  },
    ],
  },
];

// ── Currency utils ────────────────────────────────────────────────────────────

const SYM: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", AUD: "A$", JPY: "¥",
  CAD: "C$", BRL: "R$", MXN: "MX$", INR: "₹", CHF: "CHF ",
};
const CURRENCIES = ["USD", "EUR", "GBP", "AUD", "JPY", "CAD"];

function detectCurrency(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith("Europe/London"))  return "GBP";
    if (tz.startsWith("Europe/"))        return "EUR";
    if (tz.startsWith("Australia/"))     return "AUD";
    if (tz.startsWith("Asia/Tokyo"))     return "JPY";
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta")) return "INR";
    if (tz.startsWith("America/Toronto") || tz.startsWith("America/Vancouver") ||
        tz.startsWith("America/Winnipeg") || tz.startsWith("America/Halifax"))  return "CAD";
    if (tz.startsWith("America/Sao_Paulo") || tz.startsWith("America/Fortaleza")) return "BRL";
    if (tz.startsWith("America/Mexico")) return "MXN";
    if (tz.startsWith("Europe/Zurich") || tz.startsWith("Europe/Berne"))    return "CHF";
    return "USD";
  } catch { return "USD"; }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IcoCheck = ({ gold }: { gold?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke={gold ? "#FBBF24" : "#059669"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IcoDash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IcoInfo = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

// ── FAQS ─────────────────────────────────────────────────────────────────────

const FAQS = [
  { q: "Is there a setup fee?",
    a: "No. All plans include a free onboarding session. There are no hidden fees — you only pay the monthly or annual subscription." },
  { q: "Can I switch plans at any time?",
    a: "Yes. Upgrades take effect immediately. Downgrades apply at the start of your next billing cycle, and unused days are credited to your account." },
  { q: "What payment methods are accepted?",
    a: "All major credit and debit cards via Stripe. Annual plans can also be paid by bank transfer on request." },
  { q: "What happens to my data if I cancel?",
    a: "You can export all your data in CSV or JSON at any time. We retain it for 90 days after cancellation, then permanently delete it." },
  { q: "What counts as a member account?",
    a: "A member account is any adult member (parent or member role) who joins your association. Children / dependants and pick-up contacts are completely free and never count toward your limit — regardless of how many children each parent has. Operators are capped separately by plan (3 / 10 / unlimited)." },
  { q: "Is AI usage included in the Premium plan?",
    a: "Yes. All AI features in Premium are included in the subscription — no extra AI usage fees. Calls are pooled and the fair-use allowance is sufficient for any normal-sized association." },
  { q: "Can I try before I buy?",
    a: "Every plan starts with a 60-day free trial. No credit card required. You get full access to every feature on your chosen tier during the entire 60-day trial period. Billing starts automatically on Day 61." },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [billing,  setBilling]  = useState<Billing>("monthly");
  const [currency, setCurrency] = useState("USD");
  const [rates,    setRates]    = useState<Record<string, number>>({});
  const [ratesOk,  setRatesOk]  = useState(false);
  const [ratesErr, setRatesErr] = useState(false);
  const [openFaq,  setOpenFaq]  = useState<number | null>(null);

  useEffect(() => { setCurrency(detectCurrency()); }, []);

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r => r.json())
      .then((d: { rates: Record<string, number> }) => { setRates(d.rates); setRatesOk(true); })
      .catch(() => setRatesErr(true));
  }, []);

  const fmt = (usd: number): string => {
    const sym = SYM[currency] ?? (currency + " ");
    if (!ratesOk || currency === "USD") return `$${usd.toLocaleString()}`;
    const local = Math.round(usd * (rates[currency] ?? 1));
    return `${sym}${local.toLocaleString()}`;
  };

  const plans: Array<{
    key: Plan; name: string; emoji: string; badge: string | null;
    desc: string; scale: string; ring: string;
    headerBg: string; nameColor: string; priceColor: string; subColor: string;
    cta: string; ctaStyle: string; href: string;
  }> = [
    {
      key: "core", name: "Core", emoji: "🥉", badge: null,
      desc: "Perfect for small associations taking their first step into digital management.",
      scale: "", ring: "border-slate-200",
      headerBg: "bg-slate-50", nameColor: "text-slate-400", priceColor: "text-slate-900", subColor: "text-slate-400",
      cta: "Start Free Trial", ctaStyle: "bg-[#1E3A8A] text-white hover:bg-[#1e3070]", href: "/register",
    },
    {
      key: "plus", name: "Plus", emoji: "🥈", badge: "★ Most Popular",
      desc: "The complete platform for growing associations and multi-site organisations.",
      scale: "scale-[1.03]", ring: "border-[#1E3A8A] shadow-xl shadow-[#1E3A8A]/15",
      headerBg: "bg-[#1E3A8A]", nameColor: "text-blue-300", priceColor: "text-white", subColor: "text-blue-200",
      cta: "Get Started", ctaStyle: "bg-[#FBBF24] text-[#0A192F] hover:bg-[#fcd34d] font-black", href: "/register",
    },
    {
      key: "premium", name: "Premium", emoji: "🥇", badge: null,
      desc: "Full AI suite for large academies, multi-site organisations, and national associations.",
      scale: "", ring: "border-slate-800",
      headerBg: "bg-slate-900", nameColor: "text-slate-400", priceColor: "text-white", subColor: "text-slate-400",
      cta: "Get Started", ctaStyle: "bg-[#1E3A8A] text-white hover:bg-[#1e3070]", href: "/register",
    },
  ];

  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Transparent Pricing</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">Simple, honest pricing</h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto leading-relaxed">
            No platform cuts on member payments. No hidden charges. Start free for 60 days — no card required.
          </p>
        </div>

        {/* ── Controls ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          {/* Monthly / Annual */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
            <button onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer border-none outline-none ${billing === "monthly" ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-700"}`}>
              Monthly
            </button>
            <button onClick={() => setBilling("annual")}
              className={`relative px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer border-none outline-none ${billing === "annual" ? "bg-white text-slate-900 shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-700"}`}>
              Annual
              <span className="absolute -top-2.5 -right-3 bg-emerald-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                −17%
              </span>
            </button>
          </div>

          {/* Currency */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Currency:</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-200">
              {CURRENCIES.map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer border-none outline-none ${currency === c ? "bg-[#1E3A8A] text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Currency disclaimer */}
        {currency !== "USD" && (
          <div className="flex justify-center mb-8">
            <p className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
              <IcoInfo />
              {ratesErr
                ? "Live exchange rates unavailable — showing USD prices."
                : ratesOk
                  ? `Estimated in ${currency} using live rates. All charges are billed in USD — ${currency} prices are for reference only.`
                  : "Loading live exchange rates…"}
            </p>
          </div>
        )}

        {/* ── Plan cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16 items-start">
          {plans.map(plan => {
            const p     = PRICES[plan.key];
            const price = billing === "monthly" ? p.monthly : p.annual;
            const period = billing === "monthly" ? "/mo" : "/yr";
            const saving = billing === "annual" ? fmt(p.monthly * 2) : null;
            return (
              <div key={plan.key}
                className={`relative bg-white border-2 ${plan.ring} rounded-2xl overflow-hidden flex flex-col shadow-sm ${plan.scale}`}>
                {plan.badge && (
                  <div className="absolute top-4 right-4 bg-[#FBBF24] text-[#0A192F] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {plan.badge}
                  </div>
                )}

                {/* Header */}
                <div className={`${plan.headerBg} px-6 py-7`}>
                  <p className={`text-xs font-black uppercase tracking-widest mb-1 ${plan.nameColor}`}>
                    {plan.emoji} {plan.name}
                  </p>
                  <div className="flex items-end gap-1 mb-1">
                    <span className={`text-4xl font-black ${plan.priceColor}`}>
                      {fmt(price)}
                    </span>
                    <span className={`text-sm pb-1.5 ${plan.subColor}`}>{period}</span>
                  </div>
                  {saving && (
                    <p className="text-emerald-400 text-xs font-bold mt-1">2 months free — save {saving}</p>
                  )}
                  <p className={`text-xs mt-3 leading-relaxed ${plan.subColor}`}>{plan.desc}</p>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2.5 mb-2 text-sm text-slate-600">
                    <span>👤</span><span className="font-medium">{p.accounts} member accounts</span>
                  </div>
                  <div className="flex items-center gap-2.5 mb-2 text-sm text-slate-600">
                    <span>👶</span><span className="font-medium text-emerald-600">Unlimited children — always free</span>
                  </div>
                  <div className="flex items-center gap-2.5 mb-6 text-sm text-slate-600">
                    <span>🎓</span><span className="font-medium">{p.operators} operator{p.operators === "Unlimited" ? "s" : p.operators === "1" ? "" : "s"}</span>
                  </div>
                  <div className="flex-1" />
                  <a href={plan.href}
                    className={`block text-center font-bold text-sm py-3.5 rounded-xl transition-colors no-underline ${plan.ctaStyle}`}>
                    {plan.cta}
                  </a>
                  <p className="text-center text-xs text-slate-400 mt-2">60-day free trial · No card required</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Dependant safety highlight ────────────────────────────────────── */}
        <div className="mb-16 rounded-2xl overflow-hidden border-2 border-[#1E3A8A] bg-[#1E3A8A]">
          <div className="px-6 sm:px-10 py-9">
            <div className="inline-flex items-center gap-2 bg-[#FBBF24] rounded-full px-3.5 py-1.5 mb-4">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0A192F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-[#0A192F] text-[11px] font-black uppercase tracking-wider">Dependant Safety First</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-2.5 max-w-2xl">
              Every child protected — on <span className="text-[#FBBF24]">every plan</span>, with no limits.
            </h2>
            <p className="text-blue-200/80 text-sm leading-relaxed max-w-2xl mb-7">
              A child's safety is never a premium add-on. Our full guardian and emergency toolkit is included from the very first tier —
              and children, dependants and pick-up contacts are <span className="text-white font-bold">always free and unlimited</span>,
              no matter how many you add.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { t: "Smart Pick-Up", d: "Only authorised guardians can collect a child — verified by secure QR at check-out." },
                { t: "QR Guardian", d: "Single-use codes and time windows for one-off pick-ups, so access expires automatically." },
                { t: "Emergency SOS", d: "One tap broadcasts a crisis alert to every member and operator in seconds." },
                { t: "Private by design", d: "Dependant data is encrypted, GDPR-compliant, and never sold or shared. Ever." },
              ].map(f => (
                <div key={f.t} className="bg-white/8 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex"><IcoCheck gold /></span>
                    <span className="text-white font-bold text-sm">{f.t}</span>
                  </div>
                  <p className="text-blue-200/70 text-xs leading-relaxed">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Full comparison table ─────────────────────────────────────────── */}
        <div className="mb-16">
          <h2 className="text-2xl font-black text-slate-900 text-center mb-2">Full Feature Comparison</h2>
          <p className="text-center text-slate-400 text-sm mb-8">Everything included in each plan, at a glance.</p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-4 px-5 text-sm font-black text-slate-600 bg-slate-50 w-[46%]">Feature</th>
                  <th className="text-center py-4 px-3 text-sm font-black text-slate-600 bg-slate-50 w-[18%]">🥉 Core</th>
                  <th className="text-center py-4 px-3 text-sm font-black text-[#1E3A8A] bg-blue-50 w-[18%]">🥈 Plus</th>
                  <th className="text-center py-4 px-3 text-sm font-black text-slate-700 bg-slate-50 w-[18%]">🥇 Premium</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((group) => (
                  <Fragment key={group.group}>
                    {/* Group header */}
                    <tr className="bg-slate-900">
                      <td colSpan={4} className="py-2.5 px-5">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {group.group}
                        </span>
                      </td>
                    </tr>
                    {/* Feature rows */}
                    {group.rows.map((row, ri) => (
                      <tr key={row.label}
                        className={`border-b border-slate-100 ${ri % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                        <td className="py-3 px-5 text-sm text-slate-700">{row.label}</td>
                        {(["core", "plus", "premium"] as Plan[]).map((plan) => {
                          const val = row[plan];
                          const isPlus    = plan === "plus";
                          const isPremium = plan === "premium";
                          return (
                            <td key={plan}
                              className={`py-3 px-3 text-center ${isPlus ? "bg-blue-50/60" : ""}`}>
                              {val === true
                                ? <span className="inline-flex justify-center">
                                    <IcoCheck gold={isPremium} />
                                  </span>
                                : val === false
                                  ? <span className="inline-flex justify-center"><IcoDash /></span>
                                  : <span className={`text-xs font-bold ${isPlus ? "text-[#1E3A8A]" : isPremium ? "text-[#FBBF24]" : "text-slate-500"}`}>
                                      {val}
                                    </span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              {/* Footer row */}
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="py-4 px-5 text-sm font-black text-slate-700">Monthly price (USD)</td>
                  {(["core", "plus", "premium"] as Plan[]).map(plan => (
                    <td key={plan} className={`py-4 px-3 text-center font-black text-lg ${plan === "plus" ? "text-[#1E3A8A] bg-blue-50/60" : plan === "premium" ? "text-[#FBBF24]" : "text-slate-700"}`}>
                      ${PRICES[plan].monthly}/mo
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-3 px-5 text-xs text-slate-400">Annual price — 2 months free (USD)</td>
                  {(["core", "plus", "premium"] as Plan[]).map(plan => (
                    <td key={plan} className={`py-3 px-3 text-center text-xs font-bold text-emerald-600 ${plan === "plus" ? "bg-blue-50/60" : ""}`}>
                      ${PRICES[plan].annual}/yr
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-4 px-5" />
                  {plans.map(plan => (
                    <td key={plan.key} className={`py-4 px-3 ${plan.key === "plus" ? "bg-blue-50/60" : ""}`}>
                      <a href={plan.href}
                        className={`block text-center text-xs font-black py-2.5 rounded-xl no-underline transition-colors ${plan.ctaStyle}`}>
                        {plan.cta}
                      </a>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── All plans include ──────────────────────────────────────────────── */}
        <div className="bg-[#1E3A8A] rounded-2xl px-6 py-6 mb-14 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
          <div>
            <p className="font-black text-base mb-1">Included in every plan</p>
            <p className="text-blue-200 text-sm leading-relaxed">
              SSL encryption · GDPR compliant · Automated daily backups · 99.9% uptime ·
              No commission on member payments · Expo native mobile app (iOS + Android)
            </p>
          </div>
          <a href="/contact"
            className="flex-shrink-0 bg-[#FBBF24] text-[#0A192F] font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#fcd34d] transition-colors no-underline whitespace-nowrap">
            Talk to sales
          </a>
        </div>

        {/* ── ROI Callout ───────────────────────────────────────────────────── */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-7 mb-14 text-center">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Why associations switch to Stride</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            {[
              { n: "€400–800", label: "saved/month on admin time (50 members)" },
              { n: "2–4×",     label: "ROI vs manual management tools" },
              { n: "100%",     label: "paperless — digital signatures, docs, payroll" },
              { n: "0%",       label: "commission on member payments processed" },
            ].map(s => (
              <div key={s.n}>
                <p className="text-2xl font-black text-[#1E3A8A] mb-1">{s.n}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-2xl font-black text-slate-900 text-center mb-8">Pricing questions</h2>
          <div className="space-y-3 max-w-3xl mx-auto">
            {FAQS.map((item, i) => (
              <div key={item.q} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer bg-transparent border-none outline-none"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="font-bold text-slate-900 text-sm pr-4">{item.q}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
                    style={{ transform: openFaq === i ? "rotate(180deg)" : "rotate(0)", transition: "transform .2s" }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-slate-500 text-sm">
            More questions?{" "}
            <a href="/faq"     className="text-[#1E3A8A] font-semibold hover:underline">Read the full FAQ</a>
            {" "}or{" "}
            <a href="/contact" className="text-[#1E3A8A] font-semibold hover:underline">contact us</a>.
          </p>
        </div>

      </div>
    </PageShell>
  );
}
