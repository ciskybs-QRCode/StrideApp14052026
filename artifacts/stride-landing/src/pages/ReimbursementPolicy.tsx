import { PageShell } from "../components/PageShell";

const sections = [
  {
    id: "purpose",
    title: "1. Purpose and Scope",
    body: `This policy explains how payments, refunds and reimbursements work in relation to the Platform. There are two distinct payment relationships: (A) fees you pay to Stride to use the Platform; and (B) money your members pay to your Association, and money your Association reimburses to members or staff, through payment tools made available in the Platform.`,
  },
  {
    id: "facilitator",
    title: "2. Stride Is a Software Facilitator Only",
    body: `Stride is NOT a bank, payment institution, escrow agent or money-services business. Where the Platform facilitates payment collection or reimbursement, those payments are processed by an independent third-party payment processor (Stripe) and are settled to or from YOUR account. Stride does not hold, own or control your Association's funds or your members' funds at any time.`,
  },
  {
    id: "member-payments",
    title: "3. Member Payments to Your Association",
    body: `Your Association is solely and exclusively responsible for:

• Setting your own pricing, payment terms and enrolment conditions and communicating them clearly to members.
• Ensuring all payment amounts are correct before activating them in the Platform.
• Complying with all consumer-protection, tax and accounting obligations relating to money you collect.
• Handling any dispute, chargeback or complaint from a member regarding a payment to your Association.

The Platform processes payments through Stripe. Stripe's own terms and fees apply. Stride is not responsible for Stripe's fees, processing delays, account holds or reversals.`,
  },
  {
    id: "reimbursements",
    title: "4. Expense Reimbursements to Members and Staff",
    body: `The Platform includes an expense reimbursement feature that allows members and staff to submit expense claims to your Association, and allows authorised Administrators to approve and process those reimbursements.

RECEIPT THRESHOLD. Your Administrator can configure a receipt-free threshold (default: the equivalent of approximately EUR 50 / AUD 80 in your organisation's currency). Claims above this threshold require a supporting document (receipt, invoice or photograph thereof) to be uploaded before submission. Stride does not verify the authenticity of uploaded documents; that is your responsibility.

APPROVAL. All reimbursement claims require explicit approval by an authorised Administrator before any payment is made. The Platform does not process any payment automatically without Administrator approval. The Administrator who approves a claim bears sole responsibility for verifying that the claim is legitimate and the amount is correct.

PAYMENT METHODS. On approval, an Administrator may select one of the following:
• Stripe Refund (to original payment card): available only when a linked Stripe transaction exists.
• Stripe Transfer (to Stripe Connect account): available only when the claimant has a registered Stripe Connect account.
• Bank Transfer (IBAN / BSB / local account): the Platform records the claim and displays the claimant's saved bank details to the Administrator. The Administrator is responsible for executing the bank transfer through their own banking facilities.
• Cash: the Administrator confirms immediate cash payment through the Platform. No electronic transfer occurs.

DOUBLE-PAYMENT PROTECTION. Once a claim is marked as paid by any Administrator, subsequent attempts to approve the same claim will be rejected with an error. All Administrators of the Association are notified when any reimbursement is paid or rejected.

PARTIAL APPROVALS AND REJECTIONS. An Administrator may approve a claim for a lesser amount than requested, with a mandatory reason. An Administrator may also reject a claim entirely, with a reason. Stride is not responsible for disputes arising from partial approvals or rejections.`,
  },
  {
    id: "stride-fees",
    title: "5. Fees You Pay to Stride",
    body: `Subscription and service fees payable to Stride are described at the point of purchase and on stride-ops.com/pricing. Unless expressly stated otherwise in writing or required by mandatory consumer-protection law applicable in your jurisdiction, fees paid to Stride are non-refundable. Stride may offer pro-rata refunds at its discretion for unused prepaid periods on termination initiated by Stride without cause.`,
  },
  {
    id: "no-responsibility",
    title: "6. Stride Is Never Responsible for Your Money",
    body: `Stride is NOT and WILL NEVER BE responsible for any loss of funds, mispayment, failed payout, chargeback, tax liability, accounting error or dispute connected to money collected by, owed by or reimbursed by your Association, including any failure or error by Stripe or any other third-party payment processor.`,
  },
  {
    id: "currency",
    title: "7. Currency",
    body: `All payment amounts in the Platform are denominated in the currency configured for your Organisation (set at account creation and editable by your Administrator). It is your responsibility to ensure the correct currency is configured before processing any payments. Stride is not responsible for losses arising from incorrect currency configuration.`,
  },
  {
    id: "indemnity",
    title: "8. Indemnity",
    body: `You agree to defend, indemnify and hold harmless Stride from and against any claims, damages, fines, penalties, losses and costs arising out of or related to payments, refunds, reimbursements or chargebacks connected to your Association.

Acceptance: by creating an account or continuing to use the Platform, you confirm that you have read, understood and agree to this document on behalf of yourself and your Association.

Questions: info@stride-ops.com — Version 1.1-draft — © Stride Technologies`,
  },
];

export default function ReimbursementPolicy() {
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
          <h1 className="text-4xl font-black text-slate-900 mb-3">Reimbursement &amp; Payment Policy</h1>
          <p className="text-slate-500 text-sm">
            Last updated: <strong>1 June 2026</strong> &nbsp;&middot;&nbsp; Version 1.1-draft
          </p>
          <p className="text-slate-600 text-sm leading-relaxed mt-4 max-w-2xl">
            This policy explains how payments, refunds and reimbursements work in relation to the Stride Platform, and the respective responsibilities of Stride and your Association.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { label: "Stripe Secured",      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg> },
            { label: "No Funds Held",       icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg> },
            { label: "Admin-Approved Only", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg> },
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
                This policy was last reviewed on <strong>1 June 2026</strong>. For questions about payments or reimbursements, email{" "}
                <a href="mailto:info@stride-ops.com" className="text-[#1E3A8A] font-semibold hover:underline">info@stride-ops.com</a>.
              </p>
            </div>
          </main>
        </div>

      </div>
    </PageShell>
  );
}
