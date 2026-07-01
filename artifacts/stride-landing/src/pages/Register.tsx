import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CurrencyKey = "AUD" | "EUR" | "GBP" | "USD";

const ORG_TYPES = [
  { value: "sports_academy",   label: "Sports Academy" },
  { value: "martial_arts",     label: "Martial Arts Academy" },
  { value: "dance_studio",     label: "Dance Studio" },
  { value: "gym_fitness",      label: "Gym & Fitness Centre" },
  { value: "gymnastics",       label: "Gymnastics Club" },
  { value: "cultural_assoc",   label: "Cultural Association" },
  { value: "volunteer_assoc",  label: "Volunteer Association" },
  { value: "sports_club",      label: "Sports Club" },
  { value: "cheerleading",     label: "Cheerleading Squad" },
  { value: "association",      label: "General Association" },
  { value: "other",            label: "Other" },
];

const COUNTRIES: { value: string; label: string; currency: CurrencyKey }[] = [
  { value: "AU", label: "Australia",      currency: "AUD" },
  { value: "IT", label: "Italy",          currency: "EUR" },
  { value: "DE", label: "Germany",        currency: "EUR" },
  { value: "FR", label: "France",         currency: "EUR" },
  { value: "ES", label: "Spain",          currency: "EUR" },
  { value: "NL", label: "Netherlands",    currency: "EUR" },
  { value: "GB", label: "United Kingdom", currency: "GBP" },
  { value: "US", label: "United States",  currency: "USD" },
  { value: "CA", label: "Canada",         currency: "USD" },
  { value: "NZ", label: "New Zealand",    currency: "USD" },
  { value: "OT", label: "Other",          currency: "USD" },
];

const TOTAL = 5;
const STEP_LABELS = ["Association", "Account", "Payments", "Legal", "Launch"];

// ── Legal texts ───────────────────────────────────────────────────────────────

const LEGAL_DOCS = [
  {
    id: "tc",
    title: "Terms & Conditions",
    required: true,
    checkLabel: "I have read and accept the Stride Terms & Conditions",
    body: `Stride Technologies ("Stride", "we", "us", "our") provides a software-as-a-service platform (the "Platform") accessible at stride-ops.com that helps associations, schools, clubs, academies and similar organisations (the "Association", "you", "your") manage members, schedules, attendance, communications, payments and related administrative activities.

Stride provides SOFTWARE AND TECHNICAL SERVICES ONLY. Stride is not an association, school, club, employer, insurer, payment institution, legal or tax adviser, safeguarding authority or provider of any regulated or in-person activity. We supply a tool; how that tool is used is entirely your decision and your responsibility.

1. THE ASSOCIATION IS SOLELY RESPONSIBLE. By creating an account and using the Platform you confirm that: you are solely and exclusively responsible for your Association, its activities, its staff, its volunteers, its members, and all data you enter into or generate through the Platform; you are solely responsible for ensuring your use complies with every applicable local, national and international law including (without limitation) data protection (GDPR, Australian Privacy Act 1988), child safeguarding, health and safety, employment, tax, consumer protection and financial services law; Stride is NOT and WILL NEVER BE responsible for your data, your members' data, your content, your decisions or the consequences of how you run your Association.

2. LICENCE TO USE THE PLATFORM. Subject to these Terms and payment of applicable fees, Stride grants you a limited, non-exclusive, non-transferable, revocable licence to access and use the Platform solely for the internal administration of your Association. You may not resell, sublicense, copy, reverse-engineer or attempt to extract source code from the Platform.

3. ACCEPTABLE USE. You agree not to use the Platform to: store or transmit unlawful, harmful, fraudulent, infringing or abusive content; violate any person's rights; upload personal data you have no lawful basis to process; introduce malicious code; or interfere with the security or operation of the Platform. Breach may result in immediate suspension or termination without refund.

4. THIRD-PARTY SERVICES. The Platform relies on third-party services including Stripe, Twilio, email providers and cloud hosting. Your use of those services is also subject to their own terms. Stride is not responsible for the acts, omissions, availability or data practices of any third party.

5. SERVICE LEVEL AND AVAILABILITY. Stride targets reasonable availability but does not guarantee uninterrupted or error-free operation. The Platform is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, to the fullest extent permitted by applicable law.

6. FEES AND PAYMENT. Subscription and service fees are as described at stride-ops.com/pricing. Fees are charged in advance and are non-refundable unless expressly stated otherwise in writing or required by mandatory consumer-protection law. Stride may change fees on reasonable notice; continued use constitutes acceptance.

7. INTELLECTUAL PROPERTY. All intellectual property rights in the Platform are owned by or licensed to Stride. Nothing in these Terms transfers any intellectual property rights to you. You retain ownership of all data you upload to the Platform.

8. LIMITATION OF LIABILITY. To the fullest extent permitted by applicable law: Stride's total aggregate liability shall not exceed the greater of (a) fees paid by you in the twelve months preceding the claim or (b) EUR 500 / AUD 800; Stride shall not be liable for any indirect, incidental, special, consequential or punitive damages.

9. INDEMNITY. You agree to defend, indemnify and hold harmless Stride, its directors, officers, employees and agents from and against any claims, damages, fines, penalties, losses and costs arising out of your use of the Platform, your breach of these Terms, your Association's activities, or any claim by a third party arising from your use.

10. TERM AND TERMINATION. Either party may terminate on 30 days' written notice. Stride may suspend or terminate immediately (without refund) for material breach, non-payment, or use causing harm to others. On termination, your data will be deleted in accordance with Stride's Data Retention & Deletion Policy, typically within 90 days.

11. MODIFICATIONS. Stride may update these Terms from time to time. Material changes will be notified at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.

12. GOVERNING LAW. Australia (WA): laws of Western Australia, courts of Western Australia. EU/Italy: laws of Italy, courts of Milan. All other cases: laws of Western Australia.

Version 1.1-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    required: true,
    checkLabel: "I have read and accept the Stride Privacy Policy",
    body: `Part A — Privacy Policy

A1. WHO THIS POLICY APPLIES TO. This policy explains how Stride Technologies processes personal data in connection with the Platform and sets out the respective responsibilities of Stride and the Association. It applies to personal data processed through stride-ops.com and the Stride mobile/web application.

A2. ROLES UNDER DATA-PROTECTION LAW. Your Association is the DATA CONTROLLER — you determine the purposes and means of processing personal data of your members, their children/dependants, your staff and your contacts. Stride is a DATA PROCESSOR — Stride processes personal data only to provide, secure, maintain and improve the Platform, and only on your documented instructions. Where Stride processes data for its own purposes (e.g. billing, security logs), Stride acts as an independent data controller for those limited purposes.

A3. WHAT DATA IS PROCESSED. The Platform may process: names, contact details, addresses, dates of birth, emergency contacts, medical information, attendance records, payment information, photographs, digital signatures and communications. You control what data is entered; Stride processes it only as necessary to operate the Platform.

A4. LAWFUL BASIS FOR PROCESSING. You are solely responsible for identifying and documenting a valid lawful basis for every processing activity you carry out through the Platform. Where processing involves children's data or special-category data (such as health information), heightened obligations apply. Stride does not verify your lawful basis.

A5. SUB-PROCESSORS. Stride uses reputable third-party sub-processors including cloud infrastructure, database hosting, email delivery, SMS/WhatsApp messaging and payment processing (Stripe). All sub-processors are bound by appropriate data-processing agreements. A current list is available at stride-ops.com/legal or on request at info@stride-ops.com.

A6. INTERNATIONAL TRANSFERS. Personal data may be transferred to countries outside your own. Where such transfers occur, Stride applies appropriate safeguards such as Standard Contractual Clauses under GDPR or equivalent mechanisms. You are responsible for informing your data subjects of international transfers where required by applicable law.

A7. SECURITY. Stride applies technical and organisational measures including encryption in transit and at rest, access controls, audit logging and regular security reviews. In the event of a personal-data breach affecting your data, Stride will notify you without undue delay as required by law.

A8. RETENTION. You control the retention of your members' data within the Platform. Stride will delete or anonymise your data within 90 days of account termination, except where longer retention is required by law.

A9. DATA-SUBJECT RIGHTS. Your members' rights (access, rectification, erasure, restriction, portability, objection) must be fulfilled by you as the data controller. Stride will assist you to the extent technically possible. Contact info@stride-ops.com where Stride's direct involvement is technically necessary.

A10. CHILDREN'S DATA. Where the Platform is used to process personal data of children, you are solely responsible for compliance with all applicable child-protection and data-protection requirements, including obtaining valid parental or guardian consent where required. Stride applies additional access restrictions to children's sensitive data within the Platform.

A11. APPLICABLE LAW. EU/Italy: GDPR and applicable national implementing legislation. Australia: Privacy Act 1988 (Cth) and Australian Privacy Principles. Other jurisdictions: you are responsible for identifying and complying with your local data-protection law.

Version 1.1-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
  {
    id: "dpa",
    title: "Data Processing Agreement (DPA)",
    required: true,
    checkLabel: "I accept the Data Processing Agreement (Article 28 GDPR)",
    body: `Part B — Data Processing Agreement (DPA)

This Data Processing Agreement forms part of the agreement between Stride Technologies (Processor) and the Association (Controller) and is required under Article 28 GDPR. It applies automatically to all Associations subject to GDPR.

B1. SUBJECT MATTER AND DURATION. Stride processes personal data on behalf of the Association for the duration of the Association's use of the Platform and for the period necessary to fulfil the obligations described in this DPA.

B2. NATURE AND PURPOSE OF PROCESSING. Stride processes personal data solely to provide, maintain, secure and improve the Platform as described in the Terms & Conditions, and to fulfil its legal obligations. Stride does not process Association data for its own commercial purposes, including profiling or marketing.

B3. TYPES OF PERSONAL DATA AND CATEGORIES OF DATA SUBJECTS. Personal data processed may include: identification data, contact data, health/medical data, financial data and communications data. Data subjects include the Association's members, members' children/dependants, staff and volunteers.

B4. PROCESSOR OBLIGATIONS. Stride shall: process personal data only on documented instructions from the Association, except where required by applicable law; ensure that authorised persons are bound by confidentiality; implement appropriate technical and organisational security measures; not engage a new sub-processor without prior general or specific authorisation; assist the Association in fulfilling data-subject rights requests and data-protection impact assessments; delete or return all personal data on termination; make available all information necessary to demonstrate compliance and allow for audits with reasonable notice.

B5. CONTROLLER OBLIGATIONS. The Association shall: provide lawful, documented instructions for processing; ensure it has a valid lawful basis for all processing activities; provide data subjects with required privacy notices; and ensure Stride's processing on its behalf complies with applicable law.

B6. LIABILITY. Each party shall be liable for damage caused by its own breach of applicable data-protection law. Where both parties are liable for the same damage, liability shall be apportioned in accordance with their respective responsibility. The liability limitations in the Terms & Conditions apply to this DPA to the extent permitted by law.

Version 1.1-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
  {
    id: "deletion",
    title: "Data Retention & Deletion Policy",
    required: true,
    checkLabel: "I have read and accept the Data Retention & Deletion Policy",
    body: `This policy explains how long Stride retains data associated with your Association account, what happens when an account is cancelled or lapses, and how data is permanently deleted.

1. ACTIVE ACCOUNT RETENTION. While your account is active and your subscription is current, Stride retains all data you have entered for as long as your account remains active. You control what data is stored and can delete individual records at any time through the Platform's administrative tools.

2. SUBSCRIPTION AND TRIAL PERIODS. New Association accounts receive a 60-day free trial with full Platform functionality. At the end of the trial, the account transitions to a paid subscription. If no payment is activated, the account enters the grace period described below. Paid subscriptions are billed on a recurring basis on the same calendar day each month as the date the paid subscription was first activated.

3. ACCOUNT SUSPENSION AND GRACE PERIOD. If a subscription payment fails or a trial expires without a subscription being activated: Stride will send notification to the registered Admin email; the account enters a grace period during which data is retained but access may be restricted; if unpaid for 30 days after the payment due date, the account is marked for deletion.

4. DATA DELETION PROCESS. When marked for deletion, Stride will send a deletion warning email stating that all data will be permanently deleted 30 days from the date of the email, with a link to reactivate the account. If no action is taken, permanent deletion removes: all member profiles, contact details and personal data; all children/dependent profiles and associated health and medical data; all attendance records, check-in logs and activity history; all payment records and financial data (subject to legal retention obligations — see below); all documents, signatures and consent records; all messages, notifications and communications; all media uploaded through the Platform. An anonymised tombstone record (organisation ID, name marked as [DELETED], and deletion timestamp — no personal data) is retained for audit and fraud-prevention purposes. DELETION IS PERMANENT AND IRREVERSIBLE.

5. LEGAL RETENTION OBLIGATIONS. Financial and billing records may be retained for up to 7 years for tax and accounting compliance. Records of legal disputes may be retained until the matter is fully resolved. The anonymised tombstone is retained indefinitely.

6. INDIVIDUAL MEMBER ACCOUNT DELETION. Members may request deletion through their Profile settings in the Stride app. Deleting a member account removes their personal profile, contact details and login credentials. Records of their participation retained by the Association as required by law are unaffected. Deletion does not automatically cancel active enrolments. Requests are processed within 30 days.

7. YOUR RIGHTS. Under applicable data-protection law (including GDPR and the Australian Privacy Act), you may have the right to access, correct, export or request deletion of your personal data. Contact: info@stride-ops.com. Stride will respond within the timeframe required by applicable law (typically 30 days under GDPR).

Version 1.0-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
  {
    id: "reimbursement",
    title: "Reimbursement & Payment Policy",
    required: true,
    checkLabel: "I have read and accept the Reimbursement & Payment Policy",
    body: `This policy explains how payments, refunds and reimbursements work in relation to the Platform. There are two distinct payment relationships: (A) fees you pay to Stride to use the Platform; and (B) money your members pay to your Association, and money your Association reimburses to members or staff, through payment tools in the Platform.

1. STRIDE IS A SOFTWARE FACILITATOR ONLY. Stride is NOT a bank, payment institution, escrow agent or money-services business. Where the Platform facilitates payment collection or reimbursement, those payments are processed by an independent third-party payment processor (Stripe) and are settled to or from YOUR account. Stride does not hold, own or control your Association's funds or your members' funds at any time.

2. MEMBER PAYMENTS TO YOUR ASSOCIATION. Your Association is solely and exclusively responsible for: setting your own pricing, payment terms and enrolment conditions and communicating them clearly to members; ensuring all payment amounts are correct before activating them; complying with all consumer-protection, tax and accounting obligations; handling any dispute, chargeback or complaint from a member. The Platform processes payments through Stripe — Stripe's own terms and fees apply. Stride is not responsible for Stripe's fees, processing delays, account holds or reversals.

3. EXPENSE REIMBURSEMENTS TO MEMBERS AND STAFF. The Platform includes a reimbursement feature allowing members and staff to submit expense claims to your Association.

RECEIPT THRESHOLD. Your Administrator can configure a receipt-free threshold (default approximately EUR 50 / AUD 80). Claims above this threshold require a supporting document before submission. Stride does not verify the authenticity of uploaded documents.

APPROVAL. All claims require explicit approval by an authorised Administrator before any payment is made. The Platform does not process any payment automatically without Administrator approval. The approving Administrator bears sole responsibility for verifying the claim is legitimate and the amount is correct.

PAYMENT METHODS. (a) Stripe Refund — to original payment card, where a linked Stripe transaction exists. (b) Stripe Transfer — to a connected Stripe Connect account, where available. (c) Bank Transfer (IBAN/BSB/local account) — the Platform records the claim and displays bank details to the Administrator; the Administrator executes the transfer externally. (d) Cash — the Administrator confirms immediate cash payment; no electronic transfer occurs.

DOUBLE-PAYMENT PROTECTION. Once a claim is marked as paid, subsequent attempts to approve the same claim will be rejected. All Administrators are notified when any reimbursement is paid or rejected.

PARTIAL APPROVALS AND REJECTIONS. An Administrator may approve a lesser amount or reject a claim entirely, with a mandatory reason. The claimant is notified. Stride is not responsible for disputes arising from partial approvals or rejections.

4. FEES YOU PAY TO STRIDE. Unless expressly stated otherwise in writing or required by mandatory consumer-protection law, fees paid to Stride are non-refundable. Stride may offer pro-rata refunds at its discretion for unused prepaid periods on termination initiated by Stride without cause.

5. STRIDE IS NEVER RESPONSIBLE FOR YOUR MONEY. Stride is NOT and WILL NEVER BE responsible for any loss of funds, mispayment, failed payout, chargeback, tax liability, accounting error or dispute connected to money collected by, owed by or reimbursed by your Association, including any failure or error by Stripe or any other third-party payment processor.

6. CURRENCY. All payment amounts are denominated in the currency configured for your Organisation. It is your responsibility to ensure the correct currency is configured before processing any payments. Stride is not responsible for losses arising from incorrect currency configuration.

7. INDEMNITY. You agree to defend, indemnify and hold harmless Stride from and against any claims, damages, fines, penalties, losses and costs arising out of or related to payments, refunds, reimbursements or chargebacks connected to your Association.

Version 1.1-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
  {
    id: "media",
    title: "Media Responsibility Policy",
    required: true,
    checkLabel: "I have read and accept the Media Responsibility Policy",
    body: `The Platform provides optional tools that allow your Association to capture, upload, store and share photographs and video (collectively, "Media") — for example progress clips, event photos and member profile images. This policy makes clear who is responsible for that Media and the consents required.

1. THE ASSOCIATION IS THE SOLE CONTROLLER OF MEDIA. You acknowledge and accept that: you are solely and exclusively responsible for all Media captured, uploaded, stored, displayed or shared through the Platform by you, your staff or your members; you are solely responsible for obtaining, recording and retaining valid, informed and (where the subject is a minor) parental or guardian consent BEFORE any Media is captured, uploaded or shared; you are solely responsible for honouring any refusal or withdrawal of consent, including ceasing to capture Media and removing previously stored Media where required; Stride does NOT verify, validate or police consent. Any consent indicators inside the Platform are administrative aids for your staff only — they do not constitute legal consent and do not transfer any responsibility to Stride.

2. CHILDREN AND VULNERABLE PERSONS. Where Media depicts minors or vulnerable persons, you accept sole responsibility for: obtaining explicit written parental or guardian consent before capturing, storing or publishing any Media featuring a minor; restricting access to Media featuring minors to authorised staff only; immediately removing any Media if consent is withdrawn or if the Media is found to be inappropriate; complying with applicable child-safeguarding, data-protection and privacy requirements including Australian child-protection legislation and/or GDPR where applicable. Stride bears no responsibility for safeguarding outcomes arising from your use of the Platform.

3. STRIDE IS NEVER RESPONSIBLE FOR MEDIA. Stride is NOT and WILL NEVER BE responsible for: Media captured or shared without proper consent; Media that is unlawful, harmful, infringing or inappropriate; the publication of Media on social media, websites or elsewhere; or any claim, complaint, fine or damage arising from Media. If Media is misused, that is your responsibility alone.

4. LAWFUL BASIS AND PUBLICATION. You confirm that you have a valid lawful basis for every use of Media and that, before any public use (social media, marketing, website, promotional material), you have obtained explicit consent appropriate to that use from all identifiable persons depicted, or their legal guardians where applicable. You are responsible for the conduct of any third party (for example a photographer or social-media manager) you allow access for Media purposes.

5. STORAGE AND SECURITY. Media uploaded to the Platform is stored using third-party cloud infrastructure subject to reasonable technical security measures. You remain responsible for deciding what Media to upload and for the lawfulness of doing so. You should not upload Media that you do not have a lawful basis to store and share.

6. APPLICABLE LAW. Australia: Privacy Act 1988 (Cth), Australian Privacy Principles, and applicable state child-protection legislation. EU/Italy: GDPR and applicable national implementing legislation regarding image rights and child data.

7. INDEMNITY. You agree to defend, indemnify and hold harmless Stride from and against any and all claims, damages, fines, penalties, losses and costs arising out of or related to Media captured, stored, displayed, shared or published through the Platform by you, your staff or your members.

Version 1.1-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
  {
    id: "aup",
    title: "Acceptable Use Policy",
    required: true,
    checkLabel: "I have read and accept the Acceptable Use Policy",
    body: `This Acceptable Use Policy ("AUP") sets out the rules that apply to all use of the Stride Platform by Associations, their Administrators, staff (Operators) and members. Use of the Platform constitutes acceptance of this AUP. This AUP forms part of the Terms & Conditions.

1. GENERAL PRINCIPLES. The Platform is provided for the legitimate administrative management of associations, schools, clubs and similar organisations. You must use the Platform in a lawful, ethical and responsible manner. You are responsible for all use of the Platform under your account, including use by your staff and members.

2. PROHIBITED USES.

ILLEGAL OR HARMFUL ACTIVITY. You must not: engage in any activity that violates applicable local, national or international law; store, transmit or share content that is unlawful, defamatory, obscene, offensive, threatening, abusive or hateful; harass, intimidate or harm any person, including members, staff or children; engage in fraud, deception or misrepresentation of any kind.

DATA AND PRIVACY VIOLATIONS. You must not: collect, store or process personal data without a valid lawful basis under applicable data-protection law; process data of children without valid parental or guardian consent; share members' personal data with third parties without authorisation and a lawful basis; use the Platform to build profiles of individuals for purposes other than legitimate association management; attempt to access personal data of members of other organisations.

SECURITY AND TECHNICAL VIOLATIONS. You must not: attempt to circumvent, disable or interfere with any security feature of the Platform; introduce malware, viruses, ransomware or other malicious code; conduct unauthorised penetration testing, vulnerability scanning or reverse engineering of the Platform; attempt to gain unauthorised access to other users' accounts, data or systems; use automated bots, scrapers or data extraction tools against the Platform without Stride's prior written consent; overload or disrupt the Platform's infrastructure (denial-of-service attacks).

FINANCIAL AND PAYMENT VIOLATIONS. You must not: use the Platform's payment features to process payments for purposes other than legitimate association fees and services; attempt to manipulate pricing, discount codes or payment flows to obtain services fraudulently; use the Platform to facilitate money laundering, tax evasion or any other financial crime.

INTELLECTUAL PROPERTY. You must not: copy, reproduce, modify or distribute any part of the Platform's code, design or content without Stride's prior written consent; remove or alter any copyright, trademark or proprietary notices; use Stride's name, logo or trademarks without prior written permission.

CHILDREN'S SAFETY. You must not: upload, store or share any content that exploits, sexualises, endangers or is otherwise harmful to minors; use the Platform to circumvent child-safeguarding measures or to contact minors without proper authorisation from their guardians; store photographs or video of minors without valid parental consent on file.

3. CONTENT STANDARDS. All content you upload, store or share through the Platform must: be accurate and not misleading; comply with applicable law including copyright, data protection and consumer protection law; not infringe any third party's intellectual property, privacy or other rights; be appropriate for an audience that includes minors where children are enrolled in your Association.

4. CONSEQUENCES OF BREACH. Stride reserves the right, at its sole discretion and without prior notice where necessary, to: remove any content that violates this AUP; suspend or terminate access to the Platform; report illegal activity to the relevant authorities; seek damages and other legal remedies. Termination for breach does not entitle you to a refund of any prepaid subscription fees.

5. REPORTING VIOLATIONS. If you become aware of a violation of this AUP, please report it to: info@stride-ops.com. Include as much detail as possible. Stride will investigate all reports in good faith and take appropriate action.

6. RELATIONSHIP TO OTHER POLICIES. This AUP must be read alongside the Stride Terms & Conditions, Privacy Policy, Data Processing Agreement, Reimbursement Policy and Media Responsibility Policy. In case of conflict, the Terms & Conditions prevail.

Version 1.0-draft — Questions: info@stride-ops.com — © Stride Technologies`,
  },
];

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        {Array.from({ length: TOTAL }, (_, i) => i + 1).map(n => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 transition-colors
              ${n < step  ? "bg-emerald-500 text-white"
              : n === step ? "bg-[#1E3A8A] text-white"
              : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
              {n < step ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : n}
            </div>
            {n < TOTAL && (
              <div className={`flex-1 h-0.5 rounded-full transition-colors ${n < step ? "bg-emerald-500" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-medium text-slate-400">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className={step >= i + 1 ? "text-[#1E3A8A] font-bold" : ""}>{label}</span>
        ))}
      </div>
    </div>
  );
}

// ── Input styles ──────────────────────────────────────────────────────────────

const inputCls  = "w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/10 transition-colors";
const selectCls = `${inputCls} appearance-none cursor-pointer`;
const labelCls  = "block text-sm font-semibold text-slate-700 mb-2";

// ── Logo ──────────────────────────────────────────────────────────────────────

const Logo = () => (
  <img src="/stride-logo.png" alt="Stride" style={{ height: 44, width: "auto", display: "block" }} />
);

// ── Legal accordion ───────────────────────────────────────────────────────────

function LegalDoc({
  doc, agreed, onToggle, expanded, onExpand,
}: {
  doc: typeof LEGAL_DOCS[number];
  agreed: boolean;
  onToggle: (v: boolean) => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button type="button" onClick={onExpand}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-slate-50 hover:bg-slate-100 transition-colors">
        <div className="flex items-center gap-2">
          {agreed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
            </svg>
          )}
          <span className="text-sm font-semibold text-slate-800">{doc.title}{doc.required ? " *" : ""}</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 bg-white max-h-52 overflow-y-auto">
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{doc.body}</p>
        </div>
      )}

      <label className="flex items-start gap-3 px-4 py-3.5 cursor-pointer border-t border-slate-100 bg-white hover:bg-slate-50 transition-colors">
        <input type="checkbox" checked={agreed}
          onChange={e => onToggle(e.target.checked)}
          className="mt-0.5 w-4 h-4 flex-shrink-0 rounded accent-[#1E3A8A]" />
        <span className="text-slate-600 text-xs leading-relaxed">{doc.checkLabel}</span>
      </label>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Register() {
  const [step, setStep] = useState(1);

  // Step 1 — Association details
  const [orgName,   setOrgName]   = useState("");
  const [orgType,   setOrgType]   = useState("sports_academy");
  const [country,   setCountry]   = useState("AU");
  const [phone,     setPhone]     = useState("");
  const [website,   setWebsite]   = useState("");
  const [taxId,     setTaxId]     = useState("");

  // Step 2 — Admin account
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd,    setShowPwd]    = useState(false);

  // Step 4 — Legal
  const [agreed,       setAgreed]       = useState<Record<string, boolean>>({});
  const [expandedDoc,  setExpandedDoc]  = useState<string | null>(null);

  // Meta
  const [error,         setError]        = useState("");
  const [loading,       setLoading]      = useState(false);
  const [submitted,     setSubmitted]    = useState(false);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  const countryData = COUNTRIES.find(c => c.value === country) ?? COUNTRIES[0];
  const currency    = countryData.currency;

  const allLegalAgreed = LEGAL_DOCS.filter(d => d.required).every(d => agreed[d.id]);

  // ── Validation per step ────────────────────────────────────────────────────

  const next = () => {
    setError("");
    if (step === 1) {
      if (!orgName.trim()) { setError("Please enter your association name."); return; }
    }
    if (step === 2) {
      if (!firstName.trim() || !lastName.trim()) { setError("Please enter your full name."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (password !== confirmPwd) { setError("Passwords do not match."); return; }
    }
    if (step === 4) {
      if (!allLegalAgreed) { setError("Please read and accept all required legal agreements to continue."); return; }
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    setError("");
    if (!allLegalAgreed) { setError("Please accept all legal agreements to continue."); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name:  firstName.trim(),
          last_name:   lastName.trim(),
          name:        `${firstName.trim()} ${lastName.trim()}`,
          email:       email.trim().toLowerCase(),
          password,
          org_name:    orgName.trim(),
          org_type:    orgType,
          country,
          currency,
          phone:       phone.trim() || undefined,
          website:     website.trim() || undefined,
          tax_id:      taxId.trim() || undefined,
          role:        "admin",
          source:      "web_registration",
          legal_agreed: LEGAL_DOCS.map(d => ({ id: d.id, title: d.title, agreedAt: new Date().toISOString() })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setActivationUrl(data.activationUrl ?? null);
      setSubmitted(true);
    } catch {
      setError("Connection error. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full">
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-6">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Check Your Inbox</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              We sent a verification link to{" "}
              <strong className="text-[#1E3A8A]">{email}</strong>.
              Click it to activate your account, then download Stride and log in as Administrator.
            </p>

            <div className="flex flex-col gap-2.5 text-left mb-6">
              {[
                { n: "1", t: "Open the email from Stride" },
                { n: "2", t: "Click 'Activate My Account'" },
                { n: "3", t: "Download Stride & log in as Admin" },
                { n: "4", t: "Go to Settings → Billing to connect Stripe" },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <span className="w-6 h-6 rounded-full bg-[#1E3A8A] text-white text-xs font-black flex items-center justify-center flex-shrink-0">{s.n}</span>
                  <span className="text-slate-700 text-sm">{s.t}</span>
                </div>
              ))}
            </div>

            {activationUrl && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                <p className="text-amber-700 text-xs font-bold uppercase tracking-wider mb-2">Dev — Activation Link</p>
                <a href={activationUrl} className="text-[#1E3A8A] text-xs break-all underline hover:text-[#152d6e] transition-colors">
                  {activationUrl}
                </a>
              </div>
            )}

            <a href="/" className="block w-full bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm text-center hover:bg-[#e8c44b] transition-colors no-underline">
              Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Main wizard ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center no-underline mb-6">
            <Logo />
          </a>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Register Your Association</h1>
          <p className="text-slate-500 text-sm">
            Start your free 30-day trial. No credit card required.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <ProgressBar step={step} />

          {/* ── Step 1: Association Details ──────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#1E3A8A] text-sm font-bold uppercase tracking-wider mb-1">About Your Association</p>
                <p className="text-slate-500 text-sm">Tell us about your organisation so we can set up your account correctly.</p>
              </div>
              <div>
                <label className={labelCls}>Association / Organisation Name *</label>
                <input type="text" className={inputCls} placeholder="e.g. Riverside Sports Club"
                  value={orgName} onChange={e => { setOrgName(e.target.value); setError(""); }}
                  autoFocus />
              </div>
              <div>
                <label className={labelCls}>Organisation Type *</label>
                <div className="relative">
                  <select className={selectCls} value={orgType} onChange={e => setOrgType(e.target.value)}>
                    {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
              <div>
                <label className={labelCls}>Country *</label>
                <div className="relative">
                  <select className={selectCls} value={country} onChange={e => setCountry(e.target.value)}>
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <p className="text-slate-400 text-xs mt-1.5">Billing currency: <strong className="text-slate-700">{currency}</strong></p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="tel" className={inputCls} placeholder="+1 234 567 8900"
                    value={phone} onChange={e => { setPhone(e.target.value); setError(""); }} />
                </div>
                <div>
                  <label className={labelCls}>Website</label>
                  <input type="url" className={inputCls} placeholder="yourclub.org"
                    value={website} onChange={e => { setWebsite(e.target.value); setError(""); }} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Tax / VAT Number <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="text" className={inputCls} placeholder="e.g. IT12345678901"
                  value={taxId} onChange={e => { setTaxId(e.target.value); setError(""); }} />
                <p className="text-slate-400 text-xs mt-1.5">Required in some countries for invoice compliance.</p>
              </div>
            </div>
          )}

          {/* ── Step 2: Admin Account ───────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#1E3A8A] text-sm font-bold uppercase tracking-wider mb-1">Administrator Account</p>
                <p className="text-slate-500 text-sm">
                  You will be the primary admin for <strong>{orgName || "your association"}</strong>.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input type="text" className={inputCls} placeholder="Jane"
                    value={firstName} onChange={e => { setFirstName(e.target.value); setError(""); }} autoFocus />
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input type="text" className={inputCls} placeholder="Smith"
                    value={lastName} onChange={e => { setLastName(e.target.value); setError(""); }} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email Address *</label>
                <input type="email" className={inputCls} placeholder="jane@yourclub.org"
                  value={email} onChange={e => { setEmail(e.target.value); setError(""); }} />
              </div>
              <div>
                <label className={labelCls}>Password *</label>
                <div className="relative">
                  <input type={showPwd ? "text" : "password"} className={inputCls + " pr-10"}
                    placeholder="Min. 8 characters" value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPwd ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirm Password *</label>
                <input type="password" className={inputCls} placeholder="Repeat password"
                  value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setError(""); }} />
              </div>
            </div>
          )}

          {/* ── Step 3: Payment Setup (informational) ───────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#1E3A8A] text-sm font-bold uppercase tracking-wider mb-1">Payment Setup</p>
                <p className="text-slate-500 text-sm">How Stride handles payments for your association.</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <span className="text-emerald-700 font-bold text-sm">Powered by Stripe Connect</span>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Member fees go directly into your Stripe account — Stride never holds your money. Connect your Stripe account from the app after registration.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { title: "0% platform commission on member payments", desc: "What your members pay goes directly to you, minus standard Stripe processing fees." },
                  { title: "Automated operator payroll",                desc: "Set earnings per operator and Stride routes payouts automatically at the end of each period." },
                  { title: "Connect from Admin Settings after sign-up", desc: "Go to Admin → Billing → Stripe Connect and complete setup in minutes." },
                ].map(({ title, desc }) => (
                  <div key={title} className="flex gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <svg className="mt-0.5 flex-shrink-0 text-emerald-500" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div>
                      <p className="text-slate-800 text-sm font-semibold">{title}</p>
                      <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-slate-600 text-xs leading-relaxed">
                  You don&apos;t need to connect Stripe right now. Your 30-day trial runs without it. Connect when you&apos;re ready to start taking member payments.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 4: Legal & Compliance ──────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[#1E3A8A] text-sm font-bold uppercase tracking-wider mb-1">Legal &amp; Compliance</p>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Please read each document carefully and accept all required agreements before launching your account.
                </p>
              </div>

              {LEGAL_DOCS.map(doc => (
                <LegalDoc
                  key={doc.id}
                  doc={doc}
                  agreed={!!agreed[doc.id]}
                  onToggle={v => { setAgreed(a => ({ ...a, [doc.id]: v })); setError(""); }}
                  expanded={expandedDoc === doc.id}
                  onExpand={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                />
              ))}

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p className="text-amber-800 text-xs leading-relaxed">
                    By accepting these agreements you confirm you have the legal authority to bind your association to these terms. These agreements will be stored with a timestamp for your records.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 5: Review & Launch ─────────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#1E3A8A] text-sm font-bold uppercase tracking-wider mb-1">Review &amp; Launch</p>
                <p className="text-slate-500 text-sm">Confirm your details and start your free 30-day trial.</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-5 space-y-3 border border-slate-200">
                {[
                  { label: "Association",  value: orgName },
                  { label: "Type",         value: ORG_TYPES.find(t => t.value === orgType)?.label ?? orgType },
                  { label: "Country",      value: countryData.label },
                  { label: "Currency",     value: currency },
                  ...(phone   ? [{ label: "Phone",   value: phone }]   : []),
                  ...(website ? [{ label: "Website", value: website }] : []),
                  ...(taxId   ? [{ label: "Tax ID",  value: taxId }]   : []),
                  { label: "Admin Name",   value: `${firstName} ${lastName}` },
                  { label: "Admin Email",  value: email },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 text-xs font-medium uppercase tracking-wider flex-shrink-0">{label}</span>
                    <span className="text-slate-800 text-sm font-semibold text-right">{value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-[#1E3A8A]/5 border border-[#1E3A8A]/20 rounded-xl p-4">
                <p className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider mb-2">What happens next</p>
                <ul className="space-y-1.5">
                  {[
                    "Verification email sent immediately",
                    "30-day free trial starts on activation",
                    "Stripe Connect — connect from the app anytime",
                    "Configure your member registration page from Settings",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-slate-600 text-xs">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-emerald-700 text-xs font-bold">All legal agreements accepted</span>
                </div>
                <p className="text-emerald-600 text-xs">{LEGAL_DOCS.length} documents signed — stored with timestamp for your records.</p>
              </div>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────── */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────── */}
          <div className={`flex gap-3 mt-6 ${step > 1 ? "flex-row" : "flex-col"}`}>
            {step > 1 && (
              <button type="button" onClick={() => { setStep(s => s - 1); setError(""); }}
                className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl text-sm hover:border-slate-300 hover:bg-slate-50 transition-colors">
                Back
              </button>
            )}
            {step < TOTAL ? (
              <button type="button" onClick={next}
                className="flex-1 bg-[#1E3A8A] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#152d6e] transition-colors">
                Continue
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={loading}
                className="flex-1 bg-[#D4AF37] text-[#0A192F] font-black py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Creating your account&hellip;
                  </>
                ) : "Launch My Association"}
              </button>
            )}
          </div>

          <p className="text-center text-slate-400 text-xs mt-5">
            Already have an account?{" "}
            <a href="/" className="text-[#1E3A8A] hover:underline font-semibold">Back to home</a>
          </p>
        </div>

      </div>
    </div>
  );
}
