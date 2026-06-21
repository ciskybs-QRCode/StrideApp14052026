import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    body: `By accessing or using the Stride platform ("Service", "Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all of these Terms, you may not use the Service. These Terms apply to all users of the Service, including operators, administrators, members, and any other person who accesses the Platform.

The Service is provided by Stride Platform ("Company", "we", "us", "our"). We reserve the right to update these Terms at any time. Your continued use of the Service after changes are posted constitutes your acceptance of the updated Terms.`,
  },
  {
    id: "description",
    title: "2. Description of Service",
    body: `Stride is a SaaS (Software as a Service) platform designed for the management of dance schools, sports academies, and similar activity centres. The Service includes, but is not limited to:

• Member and student management (enrolment, profiles, attendance)
• Class scheduling and instructor management
• Member portal with Smart Pick-Up and emergency protocols
• QR code-based check-in and kiosk management
• Digital document signing and record keeping
• Integrated payment processing via Stripe
• AI-assisted communications and operational tools

We reserve the right to modify, suspend, or discontinue any part of the Service at any time with reasonable notice.`,
  },
  {
    id: "accounts",
    title: "3. Accounts and Registration",
    body: `To access the Service, you must create an account. You agree to:

• Provide accurate, current, and complete registration information
• Maintain the security of your password and accept all risks of unauthorized access
• Notify us immediately of any unauthorized use of your account
• Be responsible for all activities that occur under your account

Organisation administrators are responsible for all activity within their organisation's account, including activity by invited users. You must be at least 18 years of age to create an account.`,
  },
  {
    id: "data-children",
    title: "4. Data Relating to Children",
    body: `The Service is designed to process data relating to children enrolled in activity programmes. By using the Service, you agree to:

• Obtain all necessary consents from members or legal guardians before entering any dependant member's personal data into the Platform
• Process children's data only for the purposes described in our Privacy Policy
• Comply with all applicable data protection laws, including GDPR, when processing children's data
• Not collect or process sensitive health or medical data beyond what is strictly necessary for the safe delivery of activities

We take the privacy of minors extremely seriously and implement additional safeguards accordingly.`,
  },
  {
    id: "payments",
    title: "5. Payment Terms and Billing",
    body: `Subscription fees for the Platform are charged on a monthly basis per active enrolled member. By providing payment details, you authorise us to charge the applicable fees to your payment method.

• Fees are charged at the beginning of each billing period
• You may cancel your subscription at any time; access continues until the end of the paid period
• We reserve the right to change pricing with 30 days' written notice
• All payments are processed securely by Stripe; we do not store payment card information
• Late payments may result in suspension of your account; all data is retained for 30 days following suspension before permanent deletion

Member payments (members paying for courses) are processed directly between the organisation and its members via Stripe Connect.`,
  },
  {
    id: "prohibited",
    title: "6. Prohibited Uses",
    body: `You agree not to use the Service to:

• Violate any applicable laws or regulations
• Upload or transmit any unlawful, harmful, or offensive content
• Impersonate any person or entity or misrepresent your affiliation
• Attempt to gain unauthorized access to any portion of the Service or related systems
• Use the Service to send unsolicited communications (spam)
• Reverse engineer, decompile, or disassemble any part of the Service
• Use the Service in any way that could damage, disable, or impair the Platform`,
  },
  {
    id: "ip",
    title: "7. Intellectual Property",
    body: `The Service and all its content, features, and functionality are and will remain the exclusive property of Stride Platform and its licensors. Our trademarks, service marks, and logos may not be used in connection with any product or service without our prior written consent.

You retain all rights to data that you upload to the Service. By uploading data, you grant us a limited, non-exclusive licence to process that data solely for the purpose of providing the Service.`,
  },
  {
    id: "liability",
    title: "8. Limitation of Liability",
    body: `To the fullest extent permitted by applicable law, Stride Platform shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, goodwill, or other intangible losses, resulting from your use of or inability to use the Service.

Our total liability to you for any claims arising from your use of the Service shall not exceed the total fees paid by you in the 12 months preceding the claim.

The Service is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied.`,
  },
  {
    id: "termination",
    title: "9. Termination",
    body: `We may suspend or terminate your account and access to the Service immediately, without prior notice or liability, if you breach these Terms. Upon termination:

• Your right to use the Service ceases immediately
• We will retain your data for 30 days following termination to allow for data export
• After 30 days, all organisation data will be permanently and irreversibly deleted

You may terminate your account at any time by contacting us at info@stride-ops.com.`,
  },
  {
    id: "governing",
    title: "10. Governing Law",
    body: `These Terms are governed by and construed in accordance with applicable law. Any dispute arising from or related to these Terms or your use of the Service that cannot be resolved informally shall be subject to binding arbitration or, where required by law, the jurisdiction of the courts in the applicable territory.

If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force and effect.`,
  },
  {
    id: "contact-legal",
    title: "11. Contact",
    body: `If you have any questions about these Terms, please contact us at:

Email: info@stride-ops.com
Support: info@stride-ops.com

Stride Platform operates this Service and is responsible for your data under applicable data protection laws.`,
  },
];

export default function Terms() {
  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-5 py-14">

        {/* Page header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Legal</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3">Terms of Service</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;&middot;&nbsp; Effective immediately for all accounts
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4 max-w-2xl">
            Please read these Terms of Service carefully before using the Stride platform. By accessing or using our Service, you confirm that you have read, understood, and agree to be bound by these Terms.
          </p>
        </div>

        {/* Mobile ToC */}
        <div className="lg:hidden bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8">
          <p className="text-slate-700 text-xs font-bold uppercase tracking-wider mb-3">Contents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {sections.map(s => (
              <a key={s.id} href={`#${s.id}`} className="text-[#1E3A8A] text-sm hover:underline truncate">{s.title}</a>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-10 items-start">

          {/* Sticky sidebar — desktop only */}
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

          {/* Main content */}
          <main className="flex-1 min-w-0">
            <div className="space-y-10">
              {sections.map(s => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-xl font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">{s.title}</h2>
                  <div className="text-slate-600 text-sm leading-7 whitespace-pre-line">{s.body}</div>
                </section>
              ))}
            </div>

            {/* Footer notice */}
            <div className="mt-14 p-5 bg-[#1E3A8A]/5 border border-[#1E3A8A]/12 rounded-2xl">
              <p className="text-slate-600 text-sm leading-relaxed">
                These terms were last reviewed on <strong>1 June 2026</strong>. Questions? Contact{" "}
                <a href="mailto:info@stride-ops.com" className="text-[#1E3A8A] font-semibold hover:underline">info@stride-ops.com</a>.
              </p>
            </div>
          </main>
        </div>

      </div>
    </PageShell>
  );
}
