/**
 * legal-texts.ts (mobile app)
 * Professional legal document texts for the Stride platform.
 * These are displayed in the Pioneer onboarding wizard and linked from admin settings.
 *
 * VERSION: 1.0 — June 2025
 */

export const DOC_VERSION = "1.0";
export const LAST_UPDATED = "June 2025";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TERMS OF SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_OF_SERVICE = `STRIDE PLATFORM — TERMS OF SERVICE
Version 1.0 · Last updated: June 2025

PLEASE READ CAREFULLY. By completing setup you agree to these Terms on behalf
of your Organisation.

───────────────────────────────────────────

1. DEFINITIONS

"Administrator" — you, representing your Organisation.
"Organisation" — the association, club or organisation you are registering.
"Platform" — the Stride mobile and web application and all its services.
"Member Data" — personal data of your members, students and guardians.
"Stride" — Stride Technologies and its affiliates.

2. PLATFORM SERVICES

2.1 Stride provides an association management platform: member registration,
QR attendance, payment processing, document signing with audit trails,
communication tools, and operational scheduling.

2.2 Services are provided on a subscription basis. Trial periods are
non-renewable and do not carry over to paid plans.

3. ADMINISTRATOR RESPONSIBILITIES

You represent and warrant that:
(a) You are 18+ and legally authorised to act on behalf of the Organisation;
(b) All organisational and billing information is accurate and current;
(c) You will maintain the confidentiality of your credentials and notify us
    of any unauthorised access at info@stride-ops.com;
(d) You have obtained all necessary parental/guardian consents before
    entering any data relating to minors;
(e) You will comply with all applicable data protection laws, including GDPR;
(f) All users within your Organisation will comply with these Terms.

Stride is a technology platform only. Regulatory compliance (child
safeguarding, sector regulations, tax law) is exclusively your responsibility.

4. BILLING AND PAYMENT

4.1 Subscription fees are billed monthly or annually in advance. Fees
exclude applicable taxes (VAT/GST added where required by law).

4.2 Payment is processed by Stripe (PCI-DSS compliant). You authorise
recurring charges at each renewal date.

4.3 BILLING BY ACTIVE ACCOUNTS. "Active" means any account not explicitly
deleted, regardless of usage. It is the Organisation's sole responsibility
to delete accounts no longer needed. Stride will not issue refunds for
accounts that were active at billing time.

4.4 Stride may suspend access on 7 days' notice for non-payment. Data is
retained for 30 days during suspension; access is restored upon payment.

4.5 PLAN TIERS. Stride offers three flat-rate monthly plans: Core (€49/mo),
Plus (€99/mo), and Premium (€199/mo). Each tier's included features are
described in full on the pricing page. Stride reserves the right to adjust
pricing with 30 days' written notice.

4.6 FREE TRIAL. New organisations receive a 2-month free trial on their chosen
plan. No payment method is required during the trial period. At the end of the
trial, continued access requires a valid payment method. Free trials are
non-renewable and non-transferable.

4.7 UPGRADE TRIAL. After 3 consecutive months of active paid subscription,
Stride may offer an Upgrade Trial — a 2-month free evaluation of the next
higher plan tier. The administrator must click the activation link in the offer
email to accept. Declining the offer, or taking no action before the trial end
date, automatically reverts the account to the original plan tier. A confirmed
upgrade takes effect at the next billing cycle. Only one Upgrade Trial may be
granted per plan transition.

4.8 DOWNGRADE POLICY. Plan downgrades take effect at the start of the next
billing cycle. No prorated refund is issued for the remaining days of the
current paid period.

4.9 NO REFUNDS. All subscription fees are non-refundable once charged. Access
to the subscribed plan's features continues until the end of the paid period,
regardless of earlier cancellation.

5. DATA OWNERSHIP AND PROCESSING RELATIONSHIP

5.1 PROCESSOR / CONTROLLER. Member Data belongs to the Organisation. The
Organisation is the Data Controller; Stride is the Data Processor. The
Data Processing Agreement (DPA) governs this relationship in full.

5.2 STRIDE DOES NOT ACCESS MEMBER PERSONAL DATA. Stride staff do not
view, access, or use Member Data for any purpose other than providing the
Services. Any break-glass technical support access is logged and audited
— identical to how Stripe and Salesforce operate their platforms.
Stride will never sell, rent, or commercially exploit Member Data.

6. INTELLECTUAL PROPERTY

The Platform is the exclusive property of Stride Technologies. You receive
a limited, non-exclusive, non-transferable licence to use it during your
active subscription. Your Member Data and content remain your property.

7. ACCEPTABLE USE

You agree not to:
(a) Use the Platform for any unlawful purpose;
(b) Upload malicious code or content that infringes third-party rights;
(c) Attempt unauthorised access to systems or other accounts;
(d) Reverse-engineer, decompile, or resell the Platform;
(e) Use automated tools in a manner inconsistent with intended use.

8. WARRANTIES AND DISCLAIMERS

Stride warrants it will provide Services with reasonable care and skill.
THE PLATFORM IS PROVIDED "AS IS". TO THE MAXIMUM EXTENT PERMITTED BY LAW,
STRIDE MAKES NO WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR
PURPOSE. Stride does not guarantee uninterrupted or error-free operation.

9. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY LAW:
(a) STRIDE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL,
    SPECIAL OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR
    BUSINESS OPPORTUNITY;
(b) STRIDE'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED FEES PAID IN THE
    12 MONTHS IMMEDIATELY PRECEDING THE CLAIM.

Nothing excludes liability for death/personal injury caused by negligence
or fraud.

10. TERM AND TERMINATION

10.1 Either party may terminate with 30 days' written notice.

10.2 Stride may terminate immediately if you materially breach these Terms,
become insolvent, or continued access would violate applicable law.

10.3 DATA RETENTION UPON TERMINATION:
(a) All Member Data and Organisation data is retained for exactly 30 days
    after the termination date ("Retention Period");
(b) You may request a full data export at any time during the Retention
    Period at info@stride-ops.com;
(c) After the Retention Period, ALL data is permanently and irreversibly
    deleted from all Stride systems. This deletion cannot be reversed;
(d) Exception: data subject to a valid legal hold is retained only for
    the period required by law and only to the extent legally necessary.

You will receive automated notifications at 7, 3, and 1 day before trial
expiry and at 14, 7, and 3 days before scheduled data deletion.

11. LAW ENFORCEMENT AND LEGAL REQUESTS

11.1 Stride will not voluntarily disclose Member Data to law enforcement
or government authorities without a valid, legally binding court order or
equivalent legal instrument.

11.2 Where legally required, Stride will: (a) notify you as promptly as
legally permitted; (b) challenge overly broad requests; (c) provide only
the minimum data required.

12. MODIFICATIONS

Stride may modify these Terms with at least 30 days' advance notice via
in-app notification and email. Continued use constitutes acceptance.

13. GENERAL

Governing law: laws of your Organisation's jurisdiction (EU Organisations:
EU law including GDPR). These Terms, the Privacy Policy, and the DPA form
the entire Agreement. Contact: info@stride-ops.com`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRIVACY POLICY
// ─────────────────────────────────────────────────────────────────────────────

export const PRIVACY_POLICY = `STRIDE PLATFORM — PRIVACY POLICY
(Notice to Administrators under GDPR Art. 13)
Version 1.0 · Last updated: June 2025

───────────────────────────────────────────

This Policy describes how Stride Technologies ("Stride") collects, uses,
stores, and protects personal data of Administrators and Organisations.

1. WHO WE ARE — DATA CONTROLLER

Stride Technologies is the Data Controller for Administrator and
Organisation-level data.

For Member Data entered by your Organisation, Stride acts as a Data
Processor on your instructions. Your Organisation is the Data Controller
for Member Data.

Contact: info@stride-ops.com

2. WHAT DATA WE COLLECT

ACCOUNT AND IDENTITY DATA: full name, email, hashed password, phone number,
organisation name, address, tax IDs.

BILLING DATA: subscription plan, payment history. Card details processed
exclusively by Stripe; Stride stores only the last 4 digits, expiry, and
token reference.

TECHNICAL DATA: IP addresses, device type, OS, app version, session tokens,
usage analytics, error logs.

LEGAL COMPLIANCE DATA: e-signature records from this wizard (name, timestamp,
IP address, device OS, SHA-256 document hash), consent records, audit logs.

WHAT WE DO NOT COLLECT ABOUT YOUR MEMBERS: Member personal data (names,
health information, guardian contacts) is processed solely as your Processor.
Stride does not collect this data for its own purposes.

3. HOW WE USE YOUR DATA

Purpose                              Legal Basis (GDPR Art. 6)
Providing the platform services      Art. 6(1)(b) — contract performance
Processing payments / invoicing      Art. 6(1)(b) — contract performance
Operational notifications            Art. 6(1)(b) — contract performance
Platform security                    Art. 6(1)(f) — legitimate interests
Analytics / platform improvement     Art. 6(1)(f) — legitimate interests
Legal compliance / audit trails      Art. 6(1)(c) — legal obligation
Responding to legal requests         Art. 6(1)(c) — legal obligation
Optional marketing communications    Art. 6(1)(a) — explicit consent

4. DATA SHARING AND SUB-PROCESSORS

Stride shares data only with authorised sub-processors necessary to provide
the Services (stride.app/subprocessors). Current key sub-processors:
• Supabase — database infrastructure (EU region)
• Stripe — payment processing (PCI-DSS Level 1)
• Email delivery service (transactional emails only)

We do NOT sell, rent, or trade personal data to any third party for
marketing or advertising purposes whatsoever.

We share data with public authorities only when legally compelled by a
valid court order, and only to the minimum extent required.

5. INTERNATIONAL TRANSFERS

Data is primarily stored within the EEA. Transfers outside the EEA use:
Standard Contractual Clauses (SCCs) or an EU adequacy decision.

6. DATA RETENTION

Administrator and Organisation account data: active subscription + 30-day
post-termination retention period.

Payment records and invoices: 10 years (financial regulations).

Legal signatures and compliance audit logs: 7 years.

Technical logs: 90 days.

7. YOUR RIGHTS AS DATA SUBJECT

Under GDPR (and equivalent national laws):
• ACCESS (Art. 15): Obtain a copy of personal data we hold about you.
• RECTIFICATION (Art. 16): Correct inaccurate data.
• ERASURE (Art. 17): Request deletion, subject to legal retention obligations.
• RESTRICTION (Art. 18): Restrict processing in certain circumstances.
• PORTABILITY (Art. 20): Receive your data in structured, portable format.
• OBJECT (Art. 21): Object to processing based on legitimate interests.
• WITHDRAW CONSENT: At any time, without affecting lawfulness of prior processing.

Contact: info@stride-ops.com — we respond within 30 days.

8. SUPERVISORY AUTHORITY

You have the right to lodge a complaint with your competent data protection
authority. Italy: Garante (www.garanteprivacy.it). Australia: OAIC (oaic.gov.au).

9. SECURITY

Stride implements: encryption in transit (TLS 1.2+) and at rest (AES-256),
role-based access controls, multi-factor authentication for administrative
access, regular security assessments, 72-hour breach notification (GDPR Art. 33).

10. CHILDREN'S PRIVACY

The Platform is not for direct use by children under 13. Your Organisation
is responsible for obtaining lawful parental/guardian consent before
entering any minor's data. Stride processes minor data solely as your Processor.

11. CHANGES

Material changes notified at least 30 days in advance via in-app notification
and email. Current version always at stride.app/privacy.`;

// ─────────────────────────────────────────────────────────────────────────────
// 3. DATA PROCESSING AGREEMENT (DPA)
//    GDPR Art. 28 — Stride = Processor | Organisation = Controller
// ─────────────────────────────────────────────────────────────────────────────

export const DATA_PROCESSING_AGREEMENT = `STRIDE PLATFORM
DATA PROCESSING AGREEMENT (DPA)
Pursuant to GDPR Article 28
Version 1.0 · Last updated: June 2025

───────────────────────────────────────────

This DPA is between:
DATA CONTROLLER: Your Organisation (identified during onboarding)
DATA PROCESSOR: Stride Technologies ("Stride")

This DPA forms part of the Terms of Service.

1. SUBJECT MATTER AND DURATION

Stride processes personal data on behalf of the Controller to provide
the Stride association management platform Services. Processing continues
for the active subscription term plus the 30-day post-termination period,
plus any additional period required by legal hold.

2. CATEGORIES OF DATA SUBJECTS AND PERSONAL DATA

DATA SUBJECTS:
• Adult members and staff of the Organisation
• Minor students (children) enrolled by the Organisation
• Parents and legal guardians of minor members
• Operators, coaches, and administrators

PERSONAL DATA CATEGORIES:
• Identification: name, date of birth, profile photo
• Contact: email address, phone number, postal address
• Health and safety: allergies, medication notes, emergency contacts
• Financial: payment records, invoicing history
• Attendance: check-in/check-out logs, presence records
• Legal consent: e-signatures, document acceptance records
• Technical: device tokens (push notifications), QR code identifiers

SPECIAL CATEGORY DATA (GDPR Art. 9): Health and allergy data constitutes
special category data. The Controller is responsible for ensuring a lawful
basis (typically explicit consent under Art. 9(2)(a)) before entering
such data. Stride processes this only on the Controller's instructions.

3. STRIDE'S OBLIGATIONS AS PROCESSOR

3.1 PROCESS ON INSTRUCTIONS ONLY. Process personal data solely on
documented instructions from the Controller, unless legally required
otherwise. Stride will immediately inform the Controller if an instruction
appears to infringe GDPR.

3.2 CONFIDENTIALITY. Ensure authorised personnel are bound by
confidentiality obligations.

3.3 SECURITY (GDPR Art. 32). Implement appropriate technical and
organisational security measures, including: encryption in transit and
at rest; ongoing system resilience; ability to restore availability
after incidents; regular security testing.

3.4 SUB-PROCESSORS (GDPR Art. 28(2)). Not engage sub-processors without
prior authorisation. General authorisation is granted by accepting this DPA;
current sub-processors listed at stride.app/subprocessors. Stride provides
14 days' notice of any change, with the right to object. Sub-processors
are bound by equivalent data protection obligations.

3.5 ASSIST WITH DATA SUBJECT RIGHTS. Assist the Controller in responding
to access, rectification, erasure, portability, restriction, and objection
requests, taking into account the nature of processing.

3.6 BREACH NOTIFICATION. Notify the Controller within 72 hours of becoming
aware of a personal data breach affecting Member Data. Notification will
include: nature, categories affected, approximate numbers, likely consequences,
measures taken.

3.7 PRIVACY IMPACT ASSESSMENTS. Assist, where reasonably possible, with
DPIAs required under GDPR Art. 35.

3.8 DELETION ON TERMINATION. On termination: delete or return all Member
Data at the Controller's choice; complete deletion within 30 days; provide
written confirmation upon request.

3.9 AUDIT RIGHTS. Make available all information necessary to demonstrate
compliance and allow audits by the Controller or its appointed auditor
(30 days' advance notice required at info@stride-ops.com).

3.10 STRIDE ACCESS RESTRICTION. Stride staff do not routinely access Member
Data. Any technical support access is break-glass only, requires management
authorisation, and is fully logged in an internal audit trail.
This is identical to the model used by Stripe, Salesforce, and Zoom.

4. CONTROLLER'S OBLIGATIONS

You shall:
• Ensure a lawful basis exists for each category of data entered;
• Provide lawful and accurate instructions to Stride;
• Obtain parental/guardian consent before entering minor data;
• Maintain your own record of processing activities (GDPR Art. 30);
• Promptly notify Stride at info@stride-ops.com of any legal hold,
  regulatory investigation, or court order affecting Member Data.

5. INTERNATIONAL TRANSFERS

Transfers outside the EEA by Stride use Standard Contractual Clauses
or other appropriate GDPR Chapter V safeguards.

6. GOVERNING LAW

This DPA is governed by EU law and the applicable national law of the
Controller's place of establishment. Italian Organisations are additionally
governed by D.Lgs. 196/2003 (Codice Privacy) as amended.

7. CONFLICT

In case of conflict between this DPA and the Terms of Service on data
protection matters, this DPA shall prevail.`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. SUB-PROCESSOR LIST (summary for mobile display)
// ─────────────────────────────────────────────────────────────────────────────

export const SUB_PROCESSOR_LIST = `STRIDE — SUB-PROCESSOR LIST
Version 1.0 · Last updated: June 2025
(Pursuant to GDPR Art. 28(2))

───────────────────────────────────────────

INFRASTRUCTURE & DATABASE
• Supabase, Inc. — database, storage (EU region)
  supabase.com/privacy

• Replit, Inc. — cloud hosting
  replit.com/privacy

PAYMENT PROCESSING
• Stripe, Inc. — payments, billing (PCI-DSS L1)
  stripe.com/privacy

COMMUNICATIONS
• Resend, Inc. — transactional email
  resend.com/legal/privacy-policy

• Twilio, Inc. — SMS / emergency alerts
  twilio.com/en-us/legal/privacy

ARTIFICIAL INTELLIGENCE
• OpenAI, L.L.C. — AI features (anonymised data only)
  openai.com/policies/privacy-policy

MOBILE PUSH NOTIFICATIONS
• Expo Application Services — push notifications
  expo.dev/privacy

───────────────────────────────────────────

Stride will notify you 30 days in advance of any sub-processor
change. Objections: info@stride-ops.com

Full list: stride.app/subprocessors`;

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACCEPTABLE USE POLICY (summary for mobile display)
// ─────────────────────────────────────────────────────────────────────────────

export const ACCEPTABLE_USE_POLICY = `STRIDE — ACCEPTABLE USE POLICY
Version 1.0 · Last updated: June 2025

───────────────────────────────────────────

PERMITTED USE
The Platform is provided solely for lawful management of sports associations, activity clubs, and similar membership organisations.

PROHIBITED ACTIVITIES

You must NOT:
• Violate any applicable law or regulation;
• Send spam or unsolicited commercial messages;
• Harass, abuse, or threaten any individual;
• Attempt unauthorised access to Stride systems or other Organisations;
• Enter personal data of individuals who have not consented;
• Enter minor data without valid parental/guardian consent;
• Resell or sublicense access to the Platform;
• Use the Platform to process data for any third-party organisation.

CHILDREN'S DATA
Minor data may only be processed with documented parental consent
and for the legitimate purpose of your Organisation.

VIOLATIONS
Stride may suspend or terminate access without notice for material
breach of this Policy. Termination for cause carries no refund.

REPORTING ABUSE
info@stride-ops.com

Full policy: stride.app/legal`;
