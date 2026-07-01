import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "purpose",
    title: "1. Purpose",
    body: `This Acceptable Use Policy ("AUP") sets out the rules that apply to all use of the Stride Platform (stride-ops.com and the Stride application) by Associations, their Administrators, staff (Operators) and members. Use of the Platform constitutes acceptance of this AUP. This AUP forms part of the Terms and Conditions.`,
  },
  {
    id: "general",
    title: "2. General Principles",
    body: `The Platform is provided for the legitimate administrative management of associations, schools, clubs and similar organisations. You must use the Platform in a lawful, ethical and responsible manner. You are responsible for all use of the Platform under your account, including use by your staff and members.`,
  },
  {
    id: "prohibited",
    title: "3. Prohibited Uses",
    body: `You must NOT use the Platform to:

ILLEGAL OR HARMFUL ACTIVITY
• Engage in any activity that violates applicable local, national or international law or regulation.
• Store, transmit or share content that is unlawful, defamatory, obscene, offensive, threatening, abusive or hateful.
• Harass, intimidate or harm any person, including members, staff or children.
• Engage in fraud, deception or misrepresentation of any kind.

DATA AND PRIVACY VIOLATIONS
• Collect, store or process personal data without a valid lawful basis under applicable data-protection law.
• Process data of children without valid parental or guardian consent.
• Share members' personal data with third parties without authorisation and a lawful basis.
• Use the Platform to build profiles of individuals for purposes other than legitimate association management.
• Attempt to access personal data of members of other organisations.

SECURITY AND TECHNICAL VIOLATIONS
• Attempt to circumvent, disable or interfere with any security feature of the Platform.
• Introduce malware, viruses, ransomware or other malicious code.
• Conduct unauthorised penetration testing, vulnerability scanning or reverse engineering of the Platform.
• Attempt to gain unauthorised access to other users' accounts, data or systems.
• Use automated bots, scrapers or data extraction tools against the Platform without Stride's prior written consent.
• Overload or disrupt the Platform's infrastructure (denial-of-service attacks).

FINANCIAL AND PAYMENT VIOLATIONS
• Use the Platform's payment features to process payments for purposes other than legitimate association fees and services.
• Attempt to manipulate pricing, discount codes or payment flows to obtain services fraudulently.
• Use the Platform to facilitate money laundering, tax evasion or any other financial crime.

INTELLECTUAL PROPERTY
• Copy, reproduce, modify or distribute any part of the Platform's code, design or content without Stride's prior written consent.
• Remove or alter any copyright, trademark or proprietary notices in the Platform.
• Use Stride's name, logo or trademarks without prior written permission.

CHILDREN'S SAFETY
• Upload, store or share any content that exploits, sexualises, endangers or is otherwise harmful to minors.
• Use the Platform to circumvent child-safeguarding measures or to contact minors without proper authorisation from their guardians.
• Store photographs or video of minors without valid parental consent on file.`,
  },
  {
    id: "content",
    title: "4. Content Standards",
    body: `All content you upload, store or share through the Platform must:

• Be accurate and not misleading.
• Comply with applicable law including copyright, data protection and consumer protection law.
• Not infringe any third party's intellectual property, privacy or other rights.
• Be appropriate for an audience that includes minors where children are enrolled in your Association.`,
  },
  {
    id: "consequences",
    title: "5. Consequences of Breach",
    body: `Stride reserves the right, at its sole discretion and without prior notice where necessary to protect others, to:

• Remove any content that violates this AUP.
• Suspend or terminate access to the Platform for any account that breaches this AUP.
• Report illegal activity to the relevant authorities.
• Seek damages and other legal remedies for breaches that cause harm to Stride or third parties.

Termination for breach of this AUP does not entitle you to a refund of any prepaid subscription fees.`,
  },
  {
    id: "reporting",
    title: "6. Reporting Violations",
    body: `If you become aware of a violation of this AUP by another user, please report it to: info@stride-ops.com. Include as much detail as possible. Stride will investigate all reports in good faith and take appropriate action.`,
  },
  {
    id: "relationship",
    title: "7. Relationship to Other Policies",
    body: `This AUP must be read alongside the Stride Terms and Conditions, Privacy Policy and Data Processing Agreement, Reimbursement Policy and Media Responsibility Policy. In case of conflict, the Terms and Conditions prevail.

Acceptance: by creating an account or continuing to use the Platform, you confirm that you have read, understood and agree to this document on behalf of yourself and your Association.

Questions: info@stride-ops.com — Version 1.0-draft — © Stride Technologies`,
  },
];

export default function AcceptableUse() {
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
          <h1 className="text-4xl font-black text-slate-900 mb-3">Acceptable Use Policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;&middot;&nbsp; Version 1.0-draft
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4 max-w-2xl">
            Rules for lawful, ethical and responsible use of the Stride Platform by Associations, Administrators, staff and members.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { label: "Lawful Use Required",  icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
            { label: "Children Protected",   icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg> },
            { label: "Security Enforced",    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg> },
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
                This policy was last reviewed on <strong>1 June 2026</strong>. To report a violation, email{" "}
                <a href="mailto:info@stride-ops.com" className="text-[#1E3A8A] font-semibold hover:underline">info@stride-ops.com</a>.
              </p>
            </div>
          </main>
        </div>

      </div>
    </PageShell>
  );
}
