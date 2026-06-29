// ─────────────────────────────────────────────────────────────────────────────
// Onboarding legal documents — PROVISIONAL placeholders.
//
// These four documents are presented inside the new-association onboarding wizard
// and must be accepted + signed before an account is created. They are temporary
// placeholders pending independent legal review; replace the `body` strings with
// the lawyer-vetted finals when ready, then re-run `pnpm --filter @workspace/scripts run gen:legal-docx`
// AND copy the same text into:
//   - artifacts/api-server/src/lib/legal-texts.ts   (for the view/download links)
//   - artifacts/stride-app/lib/legal-texts.ts       (for the in-app wizard display)
//
// IMPORTANT: ASCII quotes only (no curly quotes) — Metro/Vite treat U+201C/U+201D
// as string delimiters and the bundle breaks.
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingLegalDoc {
  id: string;
  title: string;
  subtitle: string;
  version: string;
  body: string;
}

const VERSION = "1.0-draft";

const TERMS_CONDITIONS = `STRIDE PLATFORM - TERMS & CONDITIONS

DRAFT - PROVISIONAL VERSION PENDING INDEPENDENT LEGAL REVIEW

Version 1.0 (draft)

1. WHO WE ARE AND WHAT WE PROVIDE
Stride Technologies ("Stride", "we", "us", "our") provides a software platform (the "Platform") that helps associations, schools, clubs, academies and similar organisations (the "Association", "you", "your") manage members, schedules, attendance, communications, payments and related administrative activities.

Stride provides SOFTWARE AND TECHNICAL SERVICES ONLY. Stride is not an association, a school, a club, an employer, an insurer, a payment institution, a legal or tax advisor, a safeguarding authority, or a provider of any regulated or in-person activity. We supply a tool. How that tool is used is entirely your decision and your responsibility.

2. THE ASSOCIATION IS SOLELY RESPONSIBLE
By creating an account and using the Platform you confirm and accept that:
- You are solely and exclusively responsible for your Association, its activities, its staff, its volunteers, its members, and all data you enter into or generate through the Platform.
- You are solely responsible for ensuring that your use of the Platform complies with every applicable local, national and international law, including (without limitation) data protection, child safeguarding, health and safety, employment, tax, and consumer law.
- Stride is NOT and WILL NEVER BE responsible for your data, your members' data, your content, your decisions, or the consequences of how you run your Association.
- If the Platform is used improperly, unlawfully, negligently or abusively by you, your staff or your members, that is your responsibility alone and you accept all resulting liability.

3. LICENCE TO USE THE PLATFORM
Subject to these Terms, Stride grants you a limited, non-exclusive, non-transferable, revocable right to access and use the Platform for the internal administration of your Association. You may not resell, sublicense, copy, reverse-engineer or attempt to extract the source code of the Platform.

4. ACCEPTABLE USE
You agree not to use the Platform to store or transmit unlawful, harmful, fraudulent, infringing or abusive content; to violate the rights of any person; to upload data you have no lawful basis to process; or to interfere with the security or operation of the Platform. Breach of this section may result in immediate suspension or termination.

5. THIRD-PARTY SERVICES
The Platform may rely on third-party services (for example payment processors, messaging and email providers, and cloud hosting). Your use of those services is also subject to their own terms. Stride is not responsible for the acts, omissions, availability or pricing of any third party.

6. SERVICE PROVIDED "AS IS"
The Platform is provided "AS IS" and "AS AVAILABLE", without warranties of any kind, whether express or implied, including any implied warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement. Stride does not warrant that the Platform will be uninterrupted, error-free, or that it will meet your specific requirements.

7. LIMITATION OF LIABILITY
To the maximum extent permitted by law, Stride shall not be liable for any indirect, incidental, special, consequential or punitive damages, nor for any loss of profit, data, goodwill or business, arising out of or in connection with your use of (or inability to use) the Platform. To the maximum extent permitted by law, Stride's total aggregate liability for any claim shall not exceed the total fees actually paid by you to Stride in the three (3) months immediately preceding the event giving rise to the claim.

8. INDEMNITY
You agree to defend, indemnify and hold harmless Stride, its officers, employees and contractors from and against any and all claims, damages, fines, penalties, losses and costs (including reasonable legal fees) arising out of or related to: (a) your use of the Platform; (b) your data and content; (c) your relationship with your members; or (d) your breach of these Terms or of any applicable law.

9. SUSPENSION AND TERMINATION
You may stop using the Platform at any time. Stride may suspend or terminate access for breach of these Terms, non-payment, or where required by law. On termination, your right to use the Platform ends; you remain responsible for exporting and retaining your own records.

10. CHANGES
Stride may update these Terms and the Platform from time to time. Continued use after an update constitutes acceptance of the updated Terms.

11. GOVERNING LAW
These Terms are governed by the laws of the jurisdiction in which Stride is established, without regard to conflict-of-law rules, and subject to the mandatory consumer protections of your own jurisdiction where applicable.

12. CONTACT
Questions about these Terms: info@stride-ops.com

By accepting, you confirm you have the authority to bind your Association and that you have read, understood and agreed to these Terms & Conditions.`;

const MEDIA_RELEASE = `STRIDE PLATFORM - MEDIA RELEASE & MEDIA RESPONSIBILITY POLICY

DRAFT - PROVISIONAL VERSION PENDING INDEPENDENT LEGAL REVIEW

Version 1.0 (draft)

1. PURPOSE
The Platform provides optional tools that allow your Association to capture, upload, store and share photographs and video (collectively, "Media") - for example progress clips, event photos and member badges. This policy makes clear who is responsible for that Media. Stride provides the tools only.

2. THE ASSOCIATION IS THE SOLE CONTROLLER OF MEDIA
You acknowledge and accept that:
- You are solely and exclusively responsible for all Media captured, uploaded, stored, displayed or shared through the Platform by you, your staff or your members.
- You are solely responsible for obtaining, recording and keeping valid, informed and (where the subject is a minor) parental/guardian consent BEFORE any Media is captured, uploaded or shared.
- You are solely responsible for honouring any refusal or withdrawal of consent, including ceasing to capture Media and removing previously stored Media where required.
- Stride does NOT verify, validate or police consent. Any consent indicators inside the Platform are administrative aids for your staff; they do not constitute legal consent and do not transfer any responsibility to Stride.

3. CHILDREN AND VULNERABLE PERSONS
Where Media depicts minors or vulnerable persons, you accept heightened responsibility to comply with all applicable child-safeguarding and data-protection requirements. Stride bears no responsibility for safeguarding outcomes.

4. STRIDE IS NEVER RESPONSIBLE FOR MEDIA
Stride is NOT and WILL NEVER BE responsible for: Media captured or shared without proper consent; Media that is unlawful, harmful, infringing or inappropriate; the publication of Media on social media, websites or elsewhere; or any claim, complaint, fine or damage arising from Media. If Media is misused, that is your responsibility alone.

5. LAWFUL BASIS AND PUBLICATION
You confirm you have a lawful basis for every use of Media and that, before any public use (social media, marketing, website), you have obtained explicit consent appropriate to that use. You are responsible for the conduct of any third party (for example a photographer or social-media manager) you allow to access Media.

6. STORAGE AND SECURITY
Media uploaded to the Platform is stored using third-party cloud infrastructure. While Stride applies reasonable technical measures, you remain responsible for deciding what Media to upload and for the lawfulness of doing so.

7. INDEMNITY
You agree to defend, indemnify and hold harmless Stride from and against any and all claims, damages, fines, penalties, losses and costs (including reasonable legal fees) arising out of or related to Media captured, stored, displayed, shared or published through the Platform.

8. CONTACT
Questions about this policy: info@stride-ops.com

By accepting, you confirm that your Association assumes full and sole responsibility for all Media and for all consent relating to it, and that Stride bears no responsibility whatsoever.`;

const REIMBURSEMENT = `STRIDE PLATFORM - REIMBURSEMENT, REFUND & PAYMENTS POLICY

DRAFT - PROVISIONAL VERSION PENDING INDEPENDENT LEGAL REVIEW

Version 1.0 (draft)

1. PURPOSE
This policy explains how payments, refunds and reimbursements work in relation to the Platform, and who is responsible for them. There are two distinct payment relationships: (A) fees you pay to Stride to use the Platform; and (B) money your members pay to your Association through payment tools made available in the Platform.

2. STRIDE IS A SOFTWARE FACILITATOR ONLY
You acknowledge and accept that:
- Stride is NOT a bank, a payment institution, an escrow agent or a money-services business.
- Where the Platform helps collect member payments, those payments are processed by an independent third-party payment processor and are settled to YOUR account. Stride does not hold, own or control your members' funds.
- Stride is NOT and WILL NEVER BE responsible for refunds or reimbursements owed by your Association to your members.

3. REFUNDS AND REIMBURSEMENTS TO YOUR MEMBERS
You are solely and exclusively responsible for:
- Setting your own pricing, refund and reimbursement rules and communicating them to your members.
- Deciding, approving, calculating and issuing any refund or reimbursement to a member.
- Handling disputes, chargebacks, complaints and any related fees or penalties imposed by the payment processor or a card scheme.
- Complying with all consumer-protection, tax and accounting obligations relating to money you collect.

4. FEES YOU PAY TO STRIDE
Subscription and service fees payable to Stride are described at the point of purchase. Unless expressly stated otherwise in writing or required by mandatory law, fees paid to Stride are non-refundable. Any trial terms apply only as stated at sign-up.

5. PROCESSOR FEES AND DEDUCTIONS
Third-party payment processors charge their own fees and may withhold, delay or reverse settlements under their own terms. Stride is not responsible for processor fees, holds, delays, reversals or account decisions.

6. STRIDE IS NEVER RESPONSIBLE FOR YOUR MONEY
Stride is NOT and WILL NEVER BE responsible for any loss of funds, mispayment, failed payout, chargeback, tax liability or accounting error connected to money collected by or owed by your Association. If payment features are used improperly, that is your responsibility alone.

7. INDEMNITY
You agree to defend, indemnify and hold harmless Stride from and against any and all claims, damages, fines, penalties, losses and costs (including reasonable legal fees) arising out of or related to payments, refunds, reimbursements or chargebacks connected to your Association.

8. CONTACT
Questions about this policy: info@stride-ops.com

By accepting, you confirm that your Association is solely responsible for all member payments, refunds and reimbursements, and that Stride acts only as a software facilitator.`;

const PRIVACY_POLICY = `STRIDE PLATFORM - PRIVACY POLICY (DATA RESPONSIBILITY)

DRAFT - PROVISIONAL VERSION PENDING INDEPENDENT LEGAL REVIEW

Version 1.0 (draft)

1. PURPOSE AND ROLES
This policy explains the roles of the parties in relation to personal data processed through the Platform. Under data-protection law:
- Your Association is the DATA CONTROLLER. You decide what personal data is collected, why, and how it is used.
- Stride is a DATA PROCESSOR. Stride processes personal data only to provide the Platform, and only on your documented instructions.

2. THE ASSOCIATION IS SOLELY RESPONSIBLE FOR ITS DATA
You acknowledge and accept that:
- You are solely and exclusively responsible for all personal data you collect, enter, upload or generate through the Platform, including the data of your members, their children/dependants, your staff and your contacts.
- You are solely responsible for having a valid lawful basis for every processing activity, for providing privacy notices to data subjects, and for handling data-subject requests (access, rectification, erasure, objection, portability).
- You are solely responsible for the accuracy, lawfulness and appropriateness of the data you process.
- Stride is NOT and WILL NEVER BE responsible for your data, the lawfulness of your processing, or the consequences of how you use the Platform. If data is misused, that is your responsibility alone.

3. WHAT STRIDE DOES WITH DATA
Stride processes personal data to operate, secure, maintain and support the Platform. Stride does not sell personal data and does not use your members' personal data for its own marketing. Stride staff do not routinely access your member data; technical access is restricted, logged and used only where necessary to provide or secure the service (for example break-glass support).

4. SUB-PROCESSORS AND HOSTING
Stride uses reputable third-party sub-processors (for example cloud hosting, database, email, SMS and payment providers) to deliver the Platform. These sub-processors process data on Stride's instructions under appropriate contractual safeguards.

5. SECURITY
Stride applies reasonable technical and organisational measures designed to protect personal data. However, no system is perfectly secure. You remain responsible for managing your own access credentials, your staff's access, and the data you choose to enter.

6. INTERNATIONAL TRANSFERS
Personal data may be processed in countries other than your own. Where required, appropriate safeguards are applied. You are responsible for informing your data subjects of this where your law requires it.

7. RETENTION AND DELETION
You control the retention of your data within the Platform. On termination you are responsible for exporting any records you must keep. Stride will delete or return data in accordance with its standard processes and applicable law.

8. DATA BREACH
Stride will notify you without undue delay of any personal-data breach affecting your data of which it becomes aware. As Controller, you are responsible for any notification to authorities and to data subjects required by law.

9. STRIDE IS NEVER THE CONTROLLER OF YOUR DATA
Nothing in this policy or in your use of the Platform makes Stride the controller of your data or responsible for your compliance. That responsibility is and remains yours.

10. CONTACT
Privacy questions: info@stride-ops.com

By accepting, you confirm that your Association is the Data Controller, is solely responsible for its data and its compliance, and that Stride acts only as a Data Processor.`;

export const ONBOARDING_LEGAL_DOCS: OnboardingLegalDoc[] = [
  { id: "terms-conditions", title: "Terms & Conditions", subtitle: "Stride Platform - Service Agreement", version: VERSION, body: TERMS_CONDITIONS },
  { id: "media-release",    title: "Media Release",       subtitle: "Stride Platform - Media Responsibility Policy", version: VERSION, body: MEDIA_RELEASE },
  { id: "reimbursement",    title: "Reimbursement Policy", subtitle: "Stride Platform - Refunds & Payments", version: VERSION, body: REIMBURSEMENT },
  { id: "privacy-policy",   title: "Privacy Policy",      subtitle: "Stride Platform - Data Responsibility", version: VERSION, body: PRIVACY_POLICY },
];
