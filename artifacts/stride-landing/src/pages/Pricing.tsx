import { PageShell } from "../components/PageShell";

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "30-day trial",
    desc: "Everything you need to get up and running. No credit card required.",
    color: "border-slate-200",
    headerBg: "bg-slate-50",
    badge: null,
    features: [
      "Up to 50 students",
      "1 operator account",
      "QR check-in & kiosk",
      "Smart Pick-Up (guardian circle)",
      "Digital document signing",
      "Member portal",
      "Basic attendance reports",
      "Email support",
    ],
    cta: "Start Free Trial",
    ctaHref: "/landing/register",
    ctaStyle: "bg-[#1E3A8A] text-white hover:bg-[#1e3070]",
  },
  {
    name: "Growth",
    price: "€49",
    period: "per month",
    desc: "For established studios ready to scale. Includes all advanced safety and payment tools.",
    color: "border-[#1E3A8A]",
    headerBg: "bg-[#1E3A8A]",
    badge: "Most Popular",
    features: [
      "Up to 500 students",
      "Unlimited operator accounts",
      "Everything in Starter",
      "Emergency Pulse broadcast",
      "BLE proximity auto check-in",
      "Stripe Connect payroll",
      "Marketplace for products",
      "AI medical certificate analysis",
      "Priority support (4 h SLA)",
      "Custom branding & white-label",
    ],
    cta: "Get Started",
    ctaHref: "/landing/register",
    ctaStyle: "bg-[#D4AF37] text-[#0A192F] hover:bg-[#e8c44b]",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    desc: "Multi-site academies, franchise networks, and national associations.",
    color: "border-slate-200",
    headerBg: "bg-slate-50",
    badge: null,
    features: [
      "Unlimited students & sites",
      "Super-admin multi-tenant panel",
      "SSO / custom identity provider",
      "Dedicated SLA & account manager",
      "Custom integrations & API access",
      "On-site onboarding & training",
      "Data residency options",
      "99.9% uptime SLA contract",
    ],
    cta: "Contact Sales",
    ctaHref: "/contact",
    ctaStyle: "bg-[#1E3A8A] text-white hover:bg-[#1e3070]",
  },
];

const faqs = [
  {
    q: "Is there a setup fee?",
    a: "No. All plans include a free onboarding session and there are no hidden fees. You only pay the monthly subscription.",
  },
  {
    q: "Can I change plans at any time?",
    a: "Yes. You can upgrade or downgrade at any time. Upgrades take effect immediately; downgrades apply at your next billing cycle.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards via Stripe. Enterprise customers can also pay via bank transfer.",
  },
  {
    q: "Is my data safe if I cancel?",
    a: "Yes. On cancellation you can export all your data in CSV/JSON format. We retain it for 90 days after cancellation, then permanently delete it.",
  },
];

export default function Pricing() {
  return (
    <PageShell>
      <div className="max-w-5xl mx-auto px-5 py-14">

        {/* ── Header ── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Pricing</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">Simple, transparent pricing</h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            No hidden fees. No per-seat surprises. Start free and upgrade when you're ready.
          </p>
        </div>

        {/* ── Plans ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-14">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`relative bg-white border-2 ${plan.color} rounded-2xl overflow-hidden shadow-sm flex flex-col`}
            >
              {plan.badge && (
                <div className="absolute top-4 right-4 bg-[#D4AF37] text-[#0A192F] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {plan.badge}
                </div>
              )}

              {/* Header */}
              <div className={`${plan.headerBg} px-6 py-6`}>
                <p className={`text-sm font-black uppercase tracking-wider mb-1 ${plan.name === "Growth" ? "text-blue-200" : "text-slate-500"}`}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1.5 mb-2">
                  <span className={`text-4xl font-black ${plan.name === "Growth" ? "text-white" : "text-slate-900"}`}>
                    {plan.price}
                  </span>
                  {plan.price !== "Free" && plan.price !== "Custom" && (
                    <span className={`text-sm pb-1 ${plan.name === "Growth" ? "text-blue-200" : "text-slate-500"}`}>/mo</span>
                  )}
                </div>
                <p className={`text-xs ${plan.name === "Growth" ? "text-blue-200" : "text-slate-500"}`}>{plan.period}</p>
              </div>

              {/* Body */}
              <div className="px-6 py-5 flex flex-col flex-1">
                <p className="text-slate-600 text-sm leading-relaxed mb-5">{plan.desc}</p>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.ctaHref}
                  className={`block text-center font-bold text-sm py-3 rounded-xl transition-colors no-underline ${plan.ctaStyle}`}
                >
                  {plan.cta}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* ── Feature comparison strip ── */}
        <div className="bg-[#1E3A8A] rounded-2xl px-6 py-5 mb-14 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
          <div>
            <p className="font-black text-base">All plans include</p>
            <p className="text-blue-200 text-sm mt-0.5">99.9% uptime · SSL encryption · GDPR compliance · Regular backups</p>
          </div>
          <a href="/contact" className="flex-shrink-0 bg-[#D4AF37] text-[#0A192F] font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-[#e8c44b] transition-colors no-underline">
            Talk to us
          </a>
        </div>

        {/* ── FAQ ── */}
        <div>
          <h2 className="text-2xl font-black text-slate-900 text-center mb-8">Pricing questions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {faqs.map(item => (
              <div key={item.q} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <p className="font-black text-slate-900 text-sm mb-2">{item.q}</p>
                <p className="text-slate-500 text-sm leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-slate-500 text-sm">
            More questions?{" "}
            <a href="/faq" className="text-[#1E3A8A] font-semibold hover:underline">Read the full FAQ</a>
            {" "}or{" "}
            <a href="/contact" className="text-[#1E3A8A] font-semibold hover:underline">contact us</a>.
          </p>
        </div>

      </div>
    </PageShell>
  );
}
