import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "what",
    title: "1. What Are Cookies",
    body: `Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work more efficiently and to provide information to website owners. Similar technologies include local storage, session storage and pixel tags, which function in a comparable way.`,
  },
  {
    id: "how",
    title: "2. How Stride Uses Cookies",
    body: `The Stride Platform (stride-ops.com and the Stride application) uses cookies and similar technologies in the following categories:

STRICTLY NECESSARY COOKIES
These cookies are essential for the Platform to function. They cannot be switched off because the Platform cannot operate without them. They do not store any personally identifiable information beyond what is necessary to maintain your session. Examples:
• Session authentication token (keeps you logged in during a session)
• CSRF protection token (prevents cross-site request forgery attacks)
• User preference cookies (e.g. language, theme selection)

No consent is required for strictly necessary cookies under applicable law.

ANALYTICS AND PERFORMANCE COOKIES
We may use analytics cookies to understand how visitors use the Platform, identify errors and improve performance. These cookies collect information in aggregate and do not identify you personally. If we use such cookies, we will request your consent where required by applicable law (including the GDPR and the Italian Cookie Law implementing EU Directive 2009/136/EC).

WHAT WE DO NOT USE
Stride does NOT use:
• Advertising or targeting cookies
• Social media tracking cookies
• Third-party profiling cookies

Stride does not sell, share or rent cookie data to third parties for their own marketing purposes.`,
  },
  {
    id: "third-party",
    title: "3. Third-Party Cookies",
    body: `Certain third-party services integrated into the Platform may set their own cookies. These include:

• Stripe (payment processing) — Stripe may set cookies to prevent fraud and ensure payment security. These are strictly necessary for payment processing. See stripe.com/cookies-policy/legal for details.
• Expo / React Native web runtime — may use local storage for app state persistence on web builds.

Stride does not control third-party cookies. We recommend reviewing the privacy and cookie policies of each third party.`,
  },
  {
    id: "choices",
    title: "4. Your Choices",
    body: `You can control cookies through your browser settings. Most browsers allow you to refuse cookies, delete existing cookies, or alert you when a new cookie is set. Note that refusing strictly necessary cookies will prevent the Platform from functioning correctly.

For EU/Italian users: where consent is required, you will be presented with a cookie consent banner on your first visit. You can withdraw consent at any time by adjusting your preferences through the cookie settings link in the Platform footer.`,
  },
  {
    id: "retention",
    title: "5. Cookie Retention",
    body: `Session cookies are deleted automatically when you close your browser. Persistent cookies remain on your device for the period specified in the cookie, or until you delete them. Analytics cookies, if used, are retained for no longer than 13 months in line with CNIL/GDPR guidance.`,
  },
  {
    id: "changes",
    title: "6. Changes to This Policy",
    body: `We may update this Cookie Policy from time to time. Material changes will be communicated via the Platform or by email. The current version is always available at stride-ops.com/legal.`,
  },
  {
    id: "contact",
    title: "7. Contact",
    body: `For questions about this Cookie Policy or your privacy rights: info@stride-ops.com

Version 1.0-draft — © Stride Technologies`,
  },
];

export default function CookiePolicy() {
  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-5 py-14">

        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Legal</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3">Cookie Policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;&middot;&nbsp; Version 1.0-draft
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4 max-w-2xl">
            This policy explains how the Stride Platform uses cookies and similar technologies, and how you can control them.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { label: "No Advertising Cookies", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg> },
            { label: "No Third-Party Profiling", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg> },
            { label: "GDPR Compliant",          icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg> },
          ].map(({ label, icon }) => (
            <div key={label} className="flex items-center gap-2 bg-[#1E3A8A]/6 border border-[#1E3A8A]/12 rounded-full px-4 py-1.5 text-xs text-[#1E3A8A] font-semibold">
              {icon}<span>{label}</span>
            </div>
          ))}
        </div>

        <div className="lg:hidden bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8">
          <p className="text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">Contents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {sections.map(s => (
              <a key={s.id} href={`#${s.id}`} className="text-[#1E3A8A] text-sm hover:underline truncate">{s.title}</a>
            ))}
          </div>
        </div>

        <div className="flex gap-10 items-start">

          <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-20 self-start">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-3">On this page</p>
              <nav className="space-y-1">
                {sections.map(s => (
                  <a key={s.id} href={`#${s.id}`}
                    className="block text-sm text-slate-600 hover:text-[#1E3A8A] hover:font-semibold transition-colors py-0.5 leading-snug truncate">
                    {s.title}
                  </a>
                ))}
              </nav>
              <div className="mt-5 pt-4 border-t border-slate-200">
                <a href="mailto:info@stride-ops.com"
                  className="flex items-center gap-2 text-xs text-[#1E3A8A] font-semibold hover:underline">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  info@stride-ops.com
                </a>
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="space-y-10">
              {sections.map(s => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-xl font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">{s.title}</h2>
                  <div className="text-slate-600 text-sm leading-7 whitespace-pre-line">{s.body}</div>
                </section>
              ))}
            </div>

            <div className="mt-14 p-5 bg-[#1E3A8A]/5 border border-[#1E3A8A]/12 rounded-2xl">
              <p className="text-slate-600 text-sm leading-relaxed">
                This policy was last reviewed on <strong>1 June 2026</strong>. For questions about cookies and privacy, email{" "}
                <a href="mailto:info@stride-ops.com" className="text-[#1E3A8A] font-semibold hover:underline">info@stride-ops.com</a>.
              </p>
            </div>
          </main>
        </div>

      </div>
    </PageShell>
  );
}
