import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "intro",
    title: "1. Introduction",
    body: `Stride Platform ("we", "us", "our") is committed to protecting your personal data and respecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your information when you use the Stride platform ("Service").

This Policy complies with the General Data Protection Regulation (GDPR), the UK GDPR, and other applicable data protection laws. If you have questions about how we handle your data, please contact us at privacy@stride.app.`,
  },
  {
    id: "who",
    title: "2. Who This Policy Applies To",
    body: `This Privacy Policy applies to:

• Organisation administrators and operators who manage the Platform
• Parents or guardians who register or use the parent portal
• Children whose data is entered into the Platform by their parents or guardians
• Any other person whose personal data is processed through the Service

Stride Platform acts as a data processor when processing the personal data of your members and students on behalf of your organisation (the data controller). For our own business operations, we act as a data controller.`,
  },
  {
    id: "collect",
    title: "3. What Data We Collect",
    body: `We collect and process the following categories of personal data:

Account and Organisation Data
• Full name, email address, phone number
• Organisation name, address, and contact details
• User roles and permissions within the platform

Member and Student Data (processed on behalf of organisations)
• Full name, date of birth, gender
• Emergency contact details
• Medical information and waivers (where relevant to safe participation)
• Attendance records, enrolment information, and payment history
• Documents with digital signatures and timestamps

Technical Data
• IP address, browser type, device information
• Usage logs and access times
• Cookies and similar tracking technologies (see Section 8)

Payment Data
• Billing information is processed directly by Stripe; we do not store payment card details`,
  },
  {
    id: "purpose",
    title: "4. How We Use Your Data",
    body: `We process personal data for the following purposes:

• To provide and operate the Service under our contractual obligations (Legal basis: Contract)
• To manage user accounts and authenticate access (Legal basis: Contract)
• To process payments and manage billing (Legal basis: Contract)
• To comply with legal obligations, such as GDPR and tax requirements (Legal basis: Legal obligation)
• To send service-related communications, such as invoices and system alerts (Legal basis: Contract)
• To improve and develop the Platform based on usage patterns (Legal basis: Legitimate interests)
• To protect the security and integrity of the Service (Legal basis: Legitimate interests)

We do not sell or rent your personal data to third parties. We do not use your data for unsolicited marketing.`,
  },
  {
    id: "children",
    title: "5. Children's Data",
    body: `The Stride platform is designed for the management of minors (children) enrolled in educational or activity programmes. We treat this data with the highest level of care and apply additional protections:

• Children's data is only entered into the Platform by their parent or legal guardian, or by an authorised organisation administrator
• We do not directly collect data from children
• Parents and guardians can request access to, correction of, or deletion of their child's data at any time
• We recommend that organisations review their own data protection policies regarding the processing of children's data and ensure appropriate consents are obtained

All data relating to children is isolated to the relevant organisation's account and is not accessible by other organisations or third parties.`,
  },
  {
    id: "sharing",
    title: "6. Data Sharing and Third Parties",
    body: `We share your data only in the following limited circumstances:

Service Providers (Data Processors)
• Stripe — payment processing and billing
• Supabase — database hosting and authentication infrastructure
• OpenAI — AI-assisted features (data is anonymised where possible; no personal data is stored by OpenAI beyond the request)
• Hosting and infrastructure providers operating within the EU/UK

Legal Requirements
We may disclose your data if required to do so by law, regulation, or legal process, or to protect the rights, property, or safety of Stride Platform, our users, or others.

All third-party processors are subject to data processing agreements and are required to implement appropriate technical and organisational measures to protect your data.`,
  },
  {
    id: "retention",
    title: "7. Data Retention",
    body: `We retain personal data only for as long as is necessary for the purposes set out in this Policy:

• Active account data: retained for the duration of the subscription plus 90 days
• Deleted account data: retained for 30 days following account closure to allow data export, then permanently deleted
• Payment records: retained for 7 years to comply with accounting and tax obligations
• Audit logs: retained for 2 years
• Backup data: purged within 90 days of the primary data deletion

Upon your request, we can delete your personal data earlier, subject to any legal obligation to retain it.`,
  },
  {
    id: "rights",
    title: "8. Your Rights",
    body: `Under the GDPR and applicable data protection laws, you have the following rights:

• Right to Access — request a copy of the personal data we hold about you
• Right to Rectification — ask us to correct inaccurate or incomplete data
• Right to Erasure — request deletion of your personal data ("right to be forgotten")
• Right to Restriction — request that we limit how we process your data
• Right to Data Portability — receive your data in a structured, machine-readable format
• Right to Object — object to certain types of processing, including for legitimate interests
• Right to Withdraw Consent — where processing is based on consent, withdraw it at any time

To exercise any of these rights, contact us at privacy@stride.app. We will respond within 30 days.`,
  },
  {
    id: "security",
    title: "9. Security",
    body: `We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, loss, or destruction, including:

• TLS encryption for all data in transit
• AES-256 encryption for sensitive data at rest
• Row-level security to isolate each organisation's data
• Multi-factor authentication options for administrators
• Audit logs for all sensitive actions (payments, document signatures, account changes)
• Regular security reviews and penetration testing

No method of transmission over the internet is 100% secure. While we take reasonable precautions, we cannot guarantee absolute security.`,
  },
  {
    id: "cookies",
    title: "10. Cookies",
    body: `The Stride platform uses cookies and similar technologies to maintain your session and improve your experience:

• Session cookies — required to keep you logged in; deleted when you close your browser
• Preference cookies — remember your language and display preferences
• Analytics cookies — help us understand how the Service is used (anonymised)

You can control cookies through your browser settings. Disabling cookies may affect your ability to use certain features of the Service.`,
  },
  {
    id: "contact-privacy",
    title: "11. Contact and Complaints",
    body: `For questions, requests, or complaints regarding this Privacy Policy or our data practices:

Email: privacy@stride.app
Support: support@stride.app

If you are not satisfied with our response, you have the right to lodge a complaint with your national data protection authority (e.g., the ICO in the UK, or your local supervisory authority in the EU).`,
  },
];

export default function Privacy() {
  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-5 py-14">

        {/* Page header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Legal</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3">Privacy Policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;·&nbsp; GDPR Compliant
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4">
            This Privacy Policy describes how Stride Platform collects, uses, and protects your personal data. We are committed to transparency and your right to control your information.
          </p>
        </div>

        {/* GDPR badge */}
        <div className="flex flex-wrap gap-3 mb-10">
          {[
            { icon: "🇪🇺", label: "GDPR Compliant" },
            { icon: "🔒", label: "Data Encrypted" },
            { icon: "🏢", label: "No Data Selling" },
            { icon: "📧", label: "privacy@stride.app" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 bg-[#1E3A8A]/6 border border-[#1E3A8A]/12 rounded-full px-4 py-1.5 text-xs text-[#1E3A8A] font-semibold">
              <span>{icon}</span><span>{label}</span>
            </div>
          ))}
        </div>

        {/* Table of contents */}
        <div className="bg-[#F1F5F9] rounded-2xl p-6 mb-10">
          <p className="text-slate-700 text-xs font-bold uppercase tracking-wider mb-4">Contents</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {sections.map(s => (
              <a key={s.id} href={`#${s.id}`} className="text-[#1E3A8A] text-sm hover:underline truncate">
                {s.title}
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map(s => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="text-xl font-black text-slate-900 mb-3 pb-2 border-b border-slate-200">{s.title}</h2>
              <div className="text-slate-600 text-sm leading-7 whitespace-pre-line">{s.body}</div>
            </section>
          ))}
        </div>

        {/* Footer notice */}
        <div className="mt-14 p-5 bg-[#1E3A8A]/5 border border-[#1E3A8A]/12 rounded-2xl">
          <p className="text-slate-600 text-sm leading-relaxed">
            This policy was last reviewed on <strong>1 June 2026</strong>. To exercise your data rights or ask questions, email <a href="mailto:privacy@stride.app" className="text-[#1E3A8A] font-semibold hover:underline">privacy@stride.app</a>.
          </p>
        </div>

      </div>
    </PageShell>
  );
}
