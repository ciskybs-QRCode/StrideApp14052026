import { useState, useEffect, Fragment } from "react";
import { PageShell } from "../components/PageShell";

// ── Types ─────────────────────────────────────────────────────────────────────

type Plan    = "studio" | "company" | "academy";
type Billing = "monthly" | "annual";

// ── Pricing data ──────────────────────────────────────────────────────────────

const PRICES: Record<Plan, { monthly: number; annual: number; qr: string; operators: string }> = {
  studio:  { monthly: 49,  annual: 490,  qr: "Up to 35",  operators: "3" },
  company: { monthly: 99,  annual: 990,  qr: "Up to 100", operators: "10" },
  academy: { monthly: 199, annual: 1990, qr: "Unlimited",  operators: "Unlimited" },
};

// ── Feature comparison table ──────────────────────────────────────────────────

type CellVal = boolean | string;
interface FeatureRow { label: string; studio: CellVal; company: CellVal; academy: CellVal }
interface FeatureGroup { group: string; rows: FeatureRow[] }

const FEATURES: FeatureGroup[] = [
  {
    group: "Members & Access",
    rows: [
      { label: "Active QR codes (members + dependants)", studio: "Up to 35", company: "Up to 100", academy: "Unlimited" },
      { label: "Operator accounts",                       studio: "3",        company: "10",        academy: "Unlimited" },
      { label: "Member portal (parent + dependant view)", studio: true,       company: true,        academy: true },
      { label: "30-day free trial · no card required",    studio: true,       company: true,        academy: true },
    ],
  },
  {
    group: "Safety & Check-in",
    rows: [
      { label: "QR code check-in / check-out",                           studio: true,  company: true,  academy: true  },
      { label: "Attendance logging & reports",                            studio: true,  company: true,  academy: true  },
      { label: "Digital document signing (consent, waivers)",             studio: true,  company: true,  academy: true  },
      { label: "Smart Pick-Up (authorized guardian QR)",                  studio: false, company: true,  academy: true  },
      { label: "QR Guardian (time windows, single-use codes)",            studio: false, company: true,  academy: true  },
      { label: "Emergency SOS + crisis broadcast to all members",         studio: false, company: true,  academy: true  },
      { label: "BLE proximity auto check-in (no QR scan needed)",         studio: false, company: false, academy: true  },
    ],
  },
  {
    group: "Operations",
    rows: [
      { label: "Broadcast messaging",                                     studio: true,  company: true,  academy: true  },
      { label: "Advanced messaging (attachments, read receipts)",         studio: false, company: true,  academy: true  },
      { label: "Course booking + waitlist management",                    studio: false, company: true,  academy: true  },
      { label: "Event ticketing (shows, recitals, competitions)",         studio: false, company: false, academy: true  },
      { label: "Certificate tracking (medical, first aid + reminders)",   studio: false, company: true,  academy: true  },
      { label: "Operator scheduling + auto substitution (cascade)",       studio: false, company: true,  academy: true  },
      { label: "Multi-association (join with invite code)",               studio: false, company: true,  academy: true  },
    ],
  },
  {
    group: "Finance & Payroll",
    rows: [
      { label: "Stripe payments (memberships, lessons, fees)",            studio: false, company: true,  academy: true  },
      { label: "Marketplace (products, merchandise)",                     studio: false, company: true,  academy: true  },
      { label: "Contractor payroll + invoice PDF generation",             studio: false, company: true,  academy: true  },
      { label: "On-Wages payroll (leave, overtime, public holidays)",     studio: false, company: false, academy: true  },
      { label: "Digital employment contracts (AI-generated, signed)",     studio: false, company: false, academy: true  },
      { label: "Accountant payroll flow (scheduled authorized payments)", studio: false, company: false, academy: true  },
    ],
  },
  {
    group: "AI Features",
    rows: [
      { label: "AI medical certificate analysis (upload + auto-flag)",   studio: false, company: true,  academy: true  },
      { label: "AI Copilot (document & policy assistant)",               studio: false, company: false, academy: true  },
      { label: "AI Roster Optimizer + rescue cascade",                   studio: false, company: false, academy: true  },
      { label: "AI Jurisdiction & Contract Research (per country)",      studio: false, company: false, academy: true  },
      { label: "AI Deduction Editor (natural language payroll config)",  studio: false, company: false, academy: true  },
      { label: "AI Accountant Reply Parser (email → payroll config)",    studio: false, company: false, academy: true  },
    ],
  },
  {
    group: "Platform & Support",
    rows: [
      { label: "Analytics & reports",                                     studio: "Basic",   company: "Advanced", academy: "Custom" },
      { label: "White-label branding (logo, colors, name)",               studio: false,     company: false,      academy: true  },
      { label: "Global Pricing Engine (regional member rates)",           studio: false,     company: false,      academy: true  },
      { label: "API access (third-party integrations)",                   studio: false,     company: false,      academy: true  },
      { label: "Support",                                                  studio: "Email",   company: "Chat · 24h", academy: "Priority · 4h SLA" },
      { label: "Dedicated onboarding session",                            studio: false,     company: false,      academy: true  },
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
    stroke={gold ? "#D4AF37" : "#059669"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
  { q: "Does the QR code limit include operators?",
    a: "The member limit covers active member and dependant profiles (each with a QR code). Operators are separate and counted against the operator limit for your plan." },
  { q: "Is AI usage included in the Academy plan?",
    a: "Yes. All AI features in Academy are included in the subscription — no extra AI usage fees. Calls are pooled and the fair-use allowance is sufficient for any normal-sized association." },
  { q: "Can I try before I buy?",
    a: "Every plan starts with a 30-day free trial. No credit card required. You get full access to the features of your chosen tier during the trial." },
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
      key: "studio", name: "Studio", emoji: "🥉", badge: null,
      desc: "Perfect for small studios taking their first step into digital management.",
      scale: "", ring: "border-slate-200",
      headerBg: "bg-slate-50", nameColor: "text-slate-400", priceColor: "text-slate-900", subColor: "text-slate-400",
      cta: "Start Free Trial", ctaStyle: "bg-[#1E3A8A] text-white hover:bg-[#1e3070]", href: "/landing/register",
    },
    {
      key: "company", name: "Company", emoji: "🥈", badge: "★ Most Popular",
      desc: "The complete platform for growing dance studios and performing arts schools.",
      scale: "scale-[1.03]", ring: "border-[#1E3A8A] shadow-xl shadow-[#1E3A8A]/15",
      headerBg: "bg-[#1E3A8A]", nameColor: "text-blue-300", priceColor: "text-white", subColor: "text-blue-200",
      cta: "Get Started", ctaStyle: "bg-[#D4AF37] text-[#0A192F] hover:bg-[#e8c44b] font-black", href: "/landing/register",
    },
    {
      key: "academy", name: "Academy", emoji: "🥇", badge: null,
      desc: "Full AI suite for large academies, multi-site organisations, and national associations.",
      scale: "", ring: "border-slate-800",
      headerBg: "bg-slate-900", nameColor: "text-slate-400", priceColor: "text-white", subColor: "text-slate-400",
      cta: "Get Started", ctaStyle: "bg-[#1E3A8A] text-white hover:bg-[#1e3070]", href: "/landing/register",
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
            No platform cuts on member payments. No hidden charges. Start free for 30 days — no card required.
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
                  <div className="absolute top-4 right-4 bg-[#D4AF37] text-[#0A192F] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
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
                  <div className="flex items-center gap-2.5 mb-3 text-sm text-slate-600">
                    <span>👥</span><span className="font-medium">{p.qr} active member QR codes</span>
                  </div>
                  <div className="flex items-center gap-2.5 mb-6 text-sm text-slate-600">
                    <span>🎓</span><span className="font-medium">{p.operators} operator{p.operators === "1" ? "" : "s"}</span>
                  </div>
                  <div className="flex-1" />
                  <a href={plan.href}
                    className={`block text-center font-bold text-sm py-3.5 rounded-xl transition-colors no-underline ${plan.ctaStyle}`}>
                    {plan.cta}
                  </a>
                  <p className="text-center text-xs text-slate-400 mt-2">30-day free trial · No card required</p>
                </div>
              </div>
            );
          })}
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
                  <th className="text-center py-4 px-3 text-sm font-black text-slate-600 bg-slate-50 w-[18%]">🥉 Studio</th>
                  <th className="text-center py-4 px-3 text-sm font-black text-[#1E3A8A] bg-blue-50 w-[18%]">🥈 Company</th>
                  <th className="text-center py-4 px-3 text-sm font-black text-slate-700 bg-slate-50 w-[18%]">🥇 Academy</th>
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
                        {(["studio", "company", "academy"] as Plan[]).map((plan) => {
                          const val = row[plan];
                          const isCompany = plan === "company";
                          const isAcademy = plan === "academy";
                          return (
                            <td key={plan}
                              className={`py-3 px-3 text-center ${isCompany ? "bg-blue-50/60" : ""}`}>
                              {val === true
                                ? <span className="inline-flex justify-center">
                                    <IcoCheck gold={isAcademy} />
                                  </span>
                                : val === false
                                  ? <span className="inline-flex justify-center"><IcoDash /></span>
                                  : <span className={`text-xs font-bold ${isCompany ? "text-[#1E3A8A]" : isAcademy ? "text-[#D4AF37]" : "text-slate-500"}`}>
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
                  {(["studio", "company", "academy"] as Plan[]).map(plan => (
                    <td key={plan} className={`py-4 px-3 text-center font-black text-lg ${plan === "company" ? "text-[#1E3A8A] bg-blue-50/60" : plan === "academy" ? "text-[#D4AF37]" : "text-slate-700"}`}>
                      ${PRICES[plan].monthly}/mo
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-3 px-5 text-xs text-slate-400">Annual price — 2 months free (USD)</td>
                  {(["studio", "company", "academy"] as Plan[]).map(plan => (
                    <td key={plan} className={`py-3 px-3 text-center text-xs font-bold text-emerald-600 ${plan === "company" ? "bg-blue-50/60" : ""}`}>
                      ${PRICES[plan].annual}/yr
                    </td>
                  ))}
                </tr>
                <tr className="bg-slate-50">
                  <td className="py-4 px-5" />
                  {plans.map(plan => (
                    <td key={plan.key} className={`py-4 px-3 ${plan.key === "company" ? "bg-blue-50/60" : ""}`}>
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
            className="flex-shrink-0 bg-[#D4AF37] text-[#0A192F] font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#e8c44b] transition-colors no-underline whitespace-nowrap">
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
