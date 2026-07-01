import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "purpose",
    title: "1. Purpose",
    body: `This policy explains how long Stride retains data associated with your Association account, what happens when an account is cancelled or lapses, and how data is permanently deleted. It applies to Associations (organisations using the Platform) and their members.`,
  },
  {
    id: "active",
    title: "2. Active Account Retention",
    body: `While your Association account is active and your subscription is current, Stride retains all data you have entered into the Platform for as long as your account remains active. You control what data is stored and can delete individual records at any time through the Platform's administrative tools.`,
  },
  {
    id: "subscription",
    title: "3. Subscription and Trial Periods",
    body: `FREE TRIAL
New Association accounts receive a 60-day free trial from the date of account creation. During the trial, full Platform functionality is available. No payment is required during the trial period. At the end of the trial period, the account transitions to a paid subscription. If no payment method is provided and no subscription is activated, the account enters the grace period described in section 4.

PAID SUBSCRIPTION
Paid subscriptions are billed on a recurring basis. The billing date is the same calendar day each month as the date the paid subscription was first activated (e.g. if you first paid on the 19th of a month, you will be billed on the 19th of each subsequent month). If payment fails, the account enters the payment grace period described in section 4.`,
  },
  {
    id: "suspension",
    title: "4. Account Suspension and Grace Period",
    body: `If a subscription payment fails or a trial expires without a subscription being activated:

• Stride will send notification to the registered Admin email address informing them of the payment failure or trial expiry.
• The account enters a grace period during which data is retained but access to the Platform may be restricted.
• If payment is not received within the grace period, the account is suspended. The Admin may reactivate the account at any time by completing payment.
• If the account remains unpaid for 30 days after the payment due date, the account is marked for deletion and the data deletion process described in section 5 begins.`,
  },
  {
    id: "deletion",
    title: "5. Data Deletion Process",
    body: `INITIATION OF DELETION
When an account is marked for deletion (either after the 30-day post-suspension period, or as a result of voluntary account closure by the Admin), Stride will:
• Send a deletion warning email to the registered Admin email address, clearly stating that all data will be permanently deleted 30 days from the date of the email.
• Include in that email a link to reactivate the account and prevent deletion. Clicking the link extends the retention period by a further 30 days.
• If no action is taken within 30 days of the warning email, all data is permanently deleted as described below.

PERMANENT DELETION
Permanent deletion removes all of the following from Stride's systems:
• All member profiles, contact details and personal data
• All children/dependent profiles and associated health and medical data
• All attendance records, check-in logs and activity history
• All payment records and financial data (subject to any legal retention obligations — see section 6)
• All documents, signatures and consent records
• All messages, notifications and communications
• All media (photographs, profile images) uploaded through the Platform

An anonymised tombstone record (containing only the organisation ID, name marked as [DELETED], and deletion timestamp) is retained for audit and fraud-prevention purposes. This tombstone contains no personal data.

DELETION IS PERMANENT AND IRREVERSIBLE. Stride cannot recover deleted data after this process is complete.

CONFIRMATION
After permanent deletion is complete, Stride will send a final confirmation email to the last registered Admin email address confirming that all data has been deleted.`,
  },
  {
    id: "legal-retention",
    title: "6. Legal Retention Obligations",
    body: `Notwithstanding the above, certain data may be retained for longer periods where required by applicable law:

• Financial and billing records may be retained for up to 7 years for tax and accounting compliance (as required under Italian tax law, Australian Tax Office requirements, and other applicable regulations).
• Records of legal disputes, complaints or regulatory inquiries may be retained until the matter is fully resolved.
• The anonymised tombstone record described in section 5 is retained indefinitely for fraud prevention and audit purposes.`,
  },
  {
    id: "member-deletion",
    title: "7. Individual Member Account Deletion",
    body: `Individual members (parents, guardians, staff) may request deletion of their own account through the Platform at any time:

• Members can access the account deletion option through their Profile settings in the Stride app.
• Deleting a member account removes their personal profile, contact details and login credentials.
• Records of their participation (attendance, payments, signed documents) may be retained by the Association as part of the Association's own records, as required by applicable law or the Association's legitimate interests.
• Deletion of a member account does not automatically cancel any active enrolments or subscriptions — the member should cancel those separately before requesting account deletion.
• The account deletion request is processed within 30 days of the request.`,
  },
  {
    id: "rights",
    title: "8. Your Rights",
    body: `Under applicable data-protection law (including GDPR and the Australian Privacy Act), you may have the right to access, correct, export or request deletion of your personal data. To exercise these rights, contact: info@stride-ops.com. Stride will respond within the timeframe required by applicable law (typically 30 days under GDPR).`,
  },
  {
    id: "contact",
    title: "9. Contact",
    body: `For questions about data retention, deletion or your privacy rights: info@stride-ops.com

Version 1.0-draft — © Stride Technologies`,
  },
];

export default function DataRetention() {
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
          <h1 className="text-4xl font-black text-slate-900 mb-3">Data Retention &amp; Account Deletion Policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;&middot;&nbsp; Version 1.0-draft
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4 max-w-2xl">
            This policy explains how long Stride retains your Association's data, what happens when an account is cancelled or lapses, and how data is permanently deleted.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { label: "60-Day Trial",          icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
            { label: "30-Day Warning",        icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
            { label: "GDPR Compliant",        icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg> },
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
                This policy was last reviewed on <strong>1 June 2026</strong>. To exercise your data rights or request deletion, email{" "}
                <a href="mailto:info@stride-ops.com" className="text-[#1E3A8A] font-semibold hover:underline">info@stride-ops.com</a>.
              </p>
            </div>
          </main>
        </div>

      </div>
    </PageShell>
  );
}
