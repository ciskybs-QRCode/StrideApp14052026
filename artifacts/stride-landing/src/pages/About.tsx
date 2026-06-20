import { PageShell } from "../components/PageShell";

const values = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
    title: "Members First",
    desc: "Every feature is built with members, dependent members, and operators in mind. Safety, transparency, and trust are non-negotiable.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    ),
    title: "Technology That Works",
    desc: "No complicated setup. Stride is intuitive for operators running a small association and powerful enough for a multi-site organisation.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "Security & Privacy",
    desc: "All data is encrypted in transit and at rest. GDPR-compliant by design — we never sell or share your data.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Continuous Improvement",
    desc: "We ship updates weekly. Every feature request from operators and members goes into our backlog — you shape the roadmap.",
  },
];

const timeline = [
  { year: "2022", event: "Stride founded by a team of engineers with direct experience running sports academies" },
  { year: "2023", event: "First 20 pilot associations onboarded. QR check-in, Smart Pick-Up, and digital signing launched" },
  { year: "2024", event: "Multi-tenant architecture, Stripe Connect, and Emergency Pulse rolled out to 150+ organisations" },
  { year: "2025", event: "BLE proximity check-in, AI medical certificate analysis, and marketplace launched" },
  { year: "2026", event: "Global expansion — available in 12 countries across Europe, Australia, and North America" },
];

export default function About() {
  return (
    <PageShell>
      <div className="max-w-5xl mx-auto px-5 py-14">

        {/* ── Hero ── */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Our Story</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4 leading-tight">
            Built by operators,<br />for operators
          </h1>
          <p className="text-slate-500 text-base max-w-2xl mx-auto leading-relaxed">
            Stride was born out of frustration. Our founders ran sports associations and activity organisations and couldn't find software that handled the real complexity of managing members, payments, and staff in one place. So we built it ourselves.
          </p>
        </div>

        {/* ── Mission banner ── */}
        <div className="bg-[#1E3A8A] rounded-3xl p-8 sm:p-10 mb-16 text-white text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #FBBF24 0%, transparent 60%)" }} />
          <div className="relative z-10">
            <p className="text-[#FBBF24] text-xs font-bold uppercase tracking-widest mb-3">Our Mission</p>
            <p className="text-2xl sm:text-3xl font-black leading-snug max-w-2xl mx-auto">
              "To give every association — from a single-venue organisation to a 10-site network — the same operational power as a Fortune 500 company."
            </p>
          </div>
        </div>

        {/* ── Values ── */}
        <div className="mb-16">
          <h2 className="text-2xl font-black text-slate-900 text-center mb-8">What we stand for</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {values.map(v => (
              <div key={v.title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-[#1E3A8A] flex items-center justify-center flex-shrink-0">
                  {v.icon}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base mb-1.5">{v.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Timeline ── */}
        <div className="mb-16">
          <h2 className="text-2xl font-black text-slate-900 text-center mb-8">Our journey</h2>
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200" />
            <div className="space-y-6 pl-16">
              {timeline.map((item, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-10 top-1 w-9 h-9 rounded-full bg-[#1E3A8A] flex items-center justify-center shadow">
                    <span className="text-[#FBBF24] text-[10px] font-black">{item.year.slice(2)}</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <span className="text-[#1E3A8A] text-xs font-black uppercase tracking-wider">{item.year}</span>
                    <p className="text-slate-700 text-sm mt-1 leading-relaxed">{item.event}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {[
            { value: "500+", label: "Organisations" },
            { value: "120k+", label: "Members managed" },
            { value: "12", label: "Countries" },
            { value: "99.9%", label: "Uptime SLA" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-2xl p-5 text-center shadow-sm">
              <p className="text-3xl font-black text-[#1E3A8A]">{s.value}</p>
              <p className="text-slate-500 text-xs font-semibold mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── CTA ── */}
        <div className="text-center bg-[#F8FAFC] border border-slate-200 rounded-2xl p-8">
          <h2 className="text-xl font-black text-slate-900 mb-2">Ready to see it in action?</h2>
          <p className="text-slate-500 text-sm mb-6">Start your free 30-day trial. No credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/landing/register" className="bg-[#1E3A8A] text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-[#1e3070] transition-colors no-underline">
              Start Free Trial
            </a>
            <a href="/contact" className="bg-white border border-slate-200 text-slate-700 font-bold text-sm px-6 py-3 rounded-xl hover:border-[#1E3A8A] transition-colors no-underline">
              Talk to Us
            </a>
          </div>
        </div>

      </div>
    </PageShell>
  );
}
