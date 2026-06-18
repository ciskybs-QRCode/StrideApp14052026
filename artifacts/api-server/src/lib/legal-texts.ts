/**
 * legal-texts.ts
 * Source of truth for all Stride platform legal documents.
 *
 * DESIGN RATIONALE — DATA PROCESSOR MODEL
 * ─────────────────────────────────────────
 * Stride operates strictly as a DATA PROCESSOR under GDPR Art. 28.
 * Each subscribing Association is the DATA CONTROLLER for its members.
 * Stride staff do NOT access member personal data. Any internal access
 * is break-glass only, logged, and audited. This architecture is
 * identical to how Stripe, Zoom, Salesforce, and HubSpot operate.
 *
 * DOCUMENTS
 * ─────────
 *  1. TERMS_OF_SERVICE     — B2B agreement between Stride and the Association
 *  2. PRIVACY_POLICY       — Stride's GDPR Art. 13 notice to the Administrator
 *  3. DATA_PROCESSING_AGR  — GDPR Art. 28 DPA between Stride (Processor) and Association (Controller)
 *  4. MEDIA_CONSENT_TMPL   — Template for Associations to use with their own members
 *  5. MEMBER_PRIVACY_TMPL  — Template Privacy Notice for Associations to give their members
 *
 * VERSION: 1.0 — June 2025
 */

export const DOC_VERSION = "1.0";
export const LAST_UPDATED = "June 2025";
export const SUPPORT_EMAIL = "support@stride.app";
export const PRIVACY_EMAIL = "privacy@stride.app";
export const LEGAL_EMAIL = "legal@stride.app";
export const COMPANY_NAME = "Stride Technologies";
export const COMPANY_ADDRESS = "c/o registered agent — see stride.app/legal";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TERMS OF SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_OF_SERVICE = `STRIDE PLATFORM
TERMS OF SERVICE

Version ${DOC_VERSION} — Last updated: ${LAST_UPDATED}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT: PLEASE READ THESE TERMS CAREFULLY BEFORE ACTIVATING YOUR ACCOUNT.
BY COMPLETING THE SETUP WIZARD AND CLICKING "COMPLETE SETUP", YOU REPRESENT THAT
YOU HAVE THE AUTHORITY TO BIND YOUR ORGANISATION AND YOU AGREE TO THESE TERMS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DEFINITIONS

In these Terms, the following words have the meanings set out below:

"Administrator" means the individual completing this wizard, who represents and
acts on behalf of the Organisation.

"Agreement" means these Terms, the Privacy Policy, and the Data Processing
Agreement, collectively.

"Organisation" means the association, club, school, or legal entity on whose
behalf the Administrator has registered for the Platform.

"Platform" means the Stride software-as-a-service application, including web,
mobile, API interfaces, and any associated documentation.

"Services" means all features, functions, and support made available through
the Platform.

"Member Data" means any personal data relating to the Organisation's members,
students, guardians, or staff that is entered into or processed by the Platform.

"Stride", "we", "us", "our" refers to ${COMPANY_NAME} and its affiliates.


2. PLATFORM SERVICES

2.1 Stride provides an association management platform offering: member
registration and profile management, QR-based attendance tracking, payment
processing and invoicing, guardian communication, document signing with
electronic audit trails, and operational scheduling tools.

2.2 Services are provided on a subscription basis as described on the Stride
pricing page (stride.app/pricing) at the time of registration. We reserve
the right to modify the feature set of any plan tier with 30 days' advance
notice.

2.3 We may offer a free trial period. Trial terms are displayed during
onboarding. Trials are non-renewable and do not carry over to paid plans.


3. ADMINISTRATOR RESPONSIBILITIES

3.1 As Administrator you represent and warrant that:
(a) You are at least 18 years of age and have legal authority to act on
    behalf of the Organisation;
(b) All organisational and billing information provided is accurate and
    kept current;
(c) You will maintain the confidentiality of your credentials and promptly
    notify us of any unauthorised access at ${SUPPORT_EMAIL};
(d) You have obtained all necessary consents from parents and guardians
    before entering any data relating to minors into the Platform;
(e) You will comply with all applicable data protection laws in your
    jurisdiction, including GDPR where applicable;
(f) All users within your Organisation will comply with these Terms.

3.2 You acknowledge that Stride is a technology platform only. Stride is
not a legal entity, compliance provider, insurer, or safeguarding body for
your Organisation. Regulatory compliance with local laws (including child
safeguarding obligations, sector-specific regulations, and tax law) is
exclusively your responsibility.


4. BILLING AND PAYMENT

4.1 Subscription fees are billed in advance, monthly or annually, as
selected during setup. Fees are exclusive of applicable taxes (including
VAT/GST) which are added where required by law.

4.2 Payment is processed via Stripe. By providing payment details, you
authorise recurring charges for the subscription fee at each renewal date.

4.3 BILLING IS BASED ON ACTIVE ACCOUNTS. "Active" means any account that
has not been explicitly deleted from the Platform, irrespective of usage.
It is the Organisation's sole responsibility to delete accounts no longer
required (including departed members). Stride will not issue refunds or
credits for accounts that were active at the time of billing.

4.4 All fees are non-refundable except as required by mandatory consumer
law in your jurisdiction.

4.5 Stride reserves the right to suspend access on 7 days' written notice
for non-payment. Suspended accounts retain data for 30 days; access is
restored immediately upon payment.


5. DATA OWNERSHIP AND PROCESSING RELATIONSHIP

5.1 DATA CONTROLLER / PROCESSOR. Member Data entered into the Platform
belongs to the Organisation. The Organisation is the Data Controller; Stride
is the Data Processor. This relationship is governed in detail by the Data
Processing Agreement, which forms part of this Agreement.

5.2 STRIDE DOES NOT ACCESS MEMBER PERSONAL DATA. Stride staff do not view,
access, or use Member Data for any purpose other than providing the Services.
Any break-glass technical support access is break-glass only, logged, and
audited. Stride will never sell, rent, or commercially exploit Member Data.

5.3 ORGANISATION DATA. Stride may access and process Organisation-level
data (organisation name, administrator contact, subscription plan, billing
history) for the purpose of providing and improving the Services.

5.4 DATA SOVEREIGNTY. Member Data is stored on infrastructure located within
the European Economic Area unless otherwise agreed in writing. Sub-processors
are listed in the Data Processing Agreement and on stride.app/subprocessors.


6. INTELLECTUAL PROPERTY

6.1 The Platform — including software, design, trademarks, logos, and
documentation — is the exclusive property of Stride and is protected by
intellectual property laws worldwide.

6.2 You are granted a limited, non-exclusive, non-transferable, revocable
licence to use the Platform solely for your Organisation's internal purposes
during the active subscription period.

6.3 Your Member Data and your Organisation's content remain your property.
You grant Stride a limited, royalty-free licence to process your data solely
to the extent necessary to provide the Services.


7. ACCEPTABLE USE

7.1 You agree not to, and to ensure that users within your Organisation
do not:
(a) Use the Platform for any unlawful purpose or to facilitate illegal activity;
(b) Upload, transmit, or store malicious code, harmful content, or data that
    infringes any third-party rights;
(c) Attempt to gain unauthorised access to systems, other accounts, or data
    outside your Organisation;
(d) Reverse-engineer, decompile, or attempt to extract the source code of
    the Platform;
(e) Resell, sublicense, or make the Platform available to third parties;
(f) Use automated tools (bots, scrapers) to access the Platform in a manner
    inconsistent with its intended use;
(g) Engage in any conduct that unreasonably burdens the Platform's
    infrastructure.


8. WARRANTIES AND DISCLAIMERS

8.1 Stride warrants that it will provide the Services using reasonable care
and skill consistent with industry standards.

8.2 THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE MAXIMUM
EXTENT PERMITTED BY APPLICABLE LAW, STRIDE MAKES NO WARRANTIES, EXPRESS OR
IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE, OR UNINTERRUPTED, ERROR-FREE OPERATION.

8.3 Stride does not warrant that the Platform is free from security
vulnerabilities, that data will never be lost, or that the Platform will
meet every specific requirement of your Organisation. You are responsible
for maintaining your own data backups where critical.


9. LIMITATION OF LIABILITY

9.1 TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
(a) STRIDE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL,
    SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS,
    REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY;
(b) STRIDE'S TOTAL AGGREGATE LIABILITY TO THE ORGANISATION, FROM ALL
    CAUSES OF ACTION, SHALL NOT EXCEED THE TOTAL FEES PAID BY THE
    ORGANISATION IN THE 12-MONTH PERIOD IMMEDIATELY PRECEDING THE CLAIM.

9.2 Nothing in these Terms excludes or limits liability for: death or personal
injury caused by negligence; fraud or fraudulent misrepresentation; or any
other liability that cannot be excluded by applicable law.

9.3 You shall indemnify and hold harmless Stride, its affiliates, officers,
directors, and employees from and against any claims, damages, losses, or
expenses (including legal fees) arising from: your breach of these Terms;
your unlawful use of the Platform; or your Organisation's failure to comply
with applicable data protection laws.


10. TERM AND TERMINATION

10.1 This Agreement commences on the date you complete setup and continues
until terminated.

10.2 Either party may terminate this Agreement with 30 days' written notice.
Termination by you does not entitle you to a refund of prepaid fees.

10.3 Stride may terminate immediately upon written notice if: you materially
breach these Terms and fail to cure within 14 days of notice; you become
insolvent or enter administration; or continued access would violate applicable
law or create legal liability for Stride.

10.4 DATA RETENTION UPON TERMINATION. Following termination or subscription
lapse (including trial expiry without conversion):
(a) ALL Member Data and Organisation data is retained for exactly 30 days
    after the termination date ("Retention Period");
(b) You may request a full data export at any time during the Retention
    Period by contacting ${SUPPORT_EMAIL};
(c) After the Retention Period, ALL data is permanently and irreversibly
    deleted from all Stride systems. This deletion cannot be reversed;
(d) Exception: where Stride is legally required to retain data for law
    enforcement, regulatory, or legal proceedings, data is retained only
    for the period required by law and only to the extent legally necessary.

10.5 You will receive automated notifications at 7, 3, and 1 day before trial
expiry and at 14, 7, and 3 days before scheduled data deletion.


11. LAW ENFORCEMENT AND LEGAL REQUESTS

11.1 Stride will not voluntarily disclose Member Data to law enforcement
or government authorities without a valid, legally binding court order,
subpoena, or equivalent legal instrument.

11.2 Where legally required to disclose data, Stride will: (a) notify the
Organisation as promptly as legally permitted; (b) challenge overly broad
requests; (c) provide only the minimum data required.

11.3 Data that is subject to an active legal hold or court order is excluded
from routine deletion until the hold is lifted. Stride is not responsible
for preserving data beyond the 30-day Retention Period in the absence of
a formal legal hold notice delivered to ${LEGAL_EMAIL}.


12. MODIFICATIONS

12.1 Stride may modify these Terms at any time. We will provide at least
30 days' advance notice of material changes via in-app notification and
email. Continued use of the Platform after the effective date constitutes
acceptance of the revised Terms.

12.2 If you do not agree to modified Terms, you may terminate with 30 days'
notice before the changes take effect.


13. GENERAL PROVISIONS

13.1 GOVERNING LAW. These Terms are governed by the laws of the jurisdiction
in which your Organisation is legally established. Organisations established
in the European Union are subject to EU law including GDPR.

13.2 ENTIRE AGREEMENT. This Agreement (including the Privacy Policy and
Data Processing Agreement) constitutes the entire agreement between the
parties regarding the Platform and supersedes all prior agreements.

13.3 SEVERABILITY. If any provision is found unenforceable, the remaining
provisions continue in full force.

13.4 WAIVER. Failure to enforce any provision is not a waiver of future
enforcement rights.

13.5 CONTACT. Stride Technologies — ${LEGAL_EMAIL} — ${COMPANY_ADDRESS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© ${COMPANY_NAME}. All rights reserved.`;

// ─────────────────────────────────────────────────────────────────────────────
// 2. PRIVACY POLICY (Stride → Administrator / Organisation)
// ─────────────────────────────────────────────────────────────────────────────

export const PRIVACY_POLICY = `STRIDE PLATFORM
PRIVACY POLICY
(Notice to Administrators under GDPR Art. 13 / ePrivacy)

Version ${DOC_VERSION} — Last updated: ${LAST_UPDATED}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This Privacy Policy describes how ${COMPANY_NAME} ("Stride") collects, uses,
stores, and protects personal data in the context of the Stride platform.
It applies to Administrators and authorised staff of subscribing Organisations.

For the privacy rights of your Organisation's members and students, see the
Member Privacy Notice Template provided separately.


1. WHO WE ARE — DATA CONTROLLER IDENTITY

${COMPANY_NAME} ("Stride") is the Data Controller for the processing described
in this Policy (Administrator and Organisation-level data).

For Member Data belonging to your Organisation, Stride acts as a Data Processor
on your instructions. Your Organisation is the Data Controller for Member Data.

Contact: ${PRIVACY_EMAIL} — ${COMPANY_ADDRESS}


2. WHAT DATA WE COLLECT ABOUT ADMINISTRATORS AND ORGANISATIONS

2.1 ACCOUNT AND IDENTITY DATA
• Full name, email address, and hashed password of the Administrator
• Organisation name, legal form, registered address, phone number
• Tax identification numbers (VAT/Codice Fiscale/ABN) provided during setup
• Profile preferences and white-label configuration

2.2 BILLING AND PAYMENT DATA
• Subscription plan, billing cycle, payment history
• Payment card details are processed exclusively by Stripe (PCI-DSS compliant);
  Stride stores only the last 4 digits, expiry, and Stripe token reference

2.3 TECHNICAL AND USAGE DATA
• IP addresses, device type, operating system, app version
• Session tokens and authentication logs
• Feature usage analytics (anonymised where possible)
• Error logs and crash reports

2.4 LEGAL COMPLIANCE DATA
• Electronic signature records from this onboarding wizard (name, timestamp,
  IP address, device OS, SHA-256 document hash)
• Consent records and audit logs

2.5 WHAT WE DO NOT COLLECT ABOUT YOUR MEMBERS
Stride does not collect Member Data for its own purposes. Member personal
data (names, health information, contact details of students and guardians)
is processed solely as a Processor on your instructions.


3. HOW WE USE YOUR DATA — PROCESSING PURPOSES AND LEGAL BASES

Purpose                              | Legal Basis (GDPR Art. 6)
-------------------------------------|-------------------------------------------
Providing the platform services      | Art. 6(1)(b) — contract performance
Processing payments and invoicing    | Art. 6(1)(b) — contract performance
Sending operational notifications    | Art. 6(1)(b) — contract performance
Platform security and fraud prev.    | Art. 6(1)(f) — legitimate interests
Analytics and platform improvement   | Art. 6(1)(f) — legitimate interests
Legal compliance and audit trails    | Art. 6(1)(c) — legal obligation
Responding to legal requests         | Art. 6(1)(c) — legal obligation
Marketing communications (optional)  | Art. 6(1)(a) — explicit consent


4. DATA SHARING AND SUB-PROCESSORS

Stride shares data only with authorised sub-processors necessary to provide
the Services. A current list is maintained at stride.app/subprocessors.

Key sub-processors include:
• Supabase (database infrastructure — EU region)
• Stripe (payment processing — PCI-DSS Level 1)
• Expo / React Native ecosystem (mobile push notifications)
• Email delivery service (transactional emails)

We do not sell, rent, lease, or trade personal data with any third party
for marketing, advertising, or any commercial purpose whatsoever.

We share data with public authorities or law enforcement only when legally
compelled by a valid court order or equivalent legal instrument, and only
to the minimum extent required. See Section 8 of the Terms of Service.


5. INTERNATIONAL DATA TRANSFERS

Data is primarily stored on servers located within the European Economic
Area (EEA). Where sub-processors are located outside the EEA, transfers
are governed by one or more of the following safeguards:
• European Commission Standard Contractual Clauses (SCCs)
• Adequacy decision by the European Commission
• Binding corporate rules where applicable


6. DATA RETENTION

Administrator and Organisation account data: retained for the duration of
the active subscription plus the 30-day post-termination retention period.

Payment records and invoices: 10 years to comply with financial regulations.

Legal signatures and compliance audit logs: 7 years to meet record-keeping
obligations.

Technical logs: 90 days.

Upon permanent deletion, all data is irreversibly removed from Stride systems
and sub-processor systems within 30 days of the deletion date.


7. YOUR RIGHTS AS DATA SUBJECT

Under GDPR (and equivalent national laws), you have the following rights:

• RIGHT OF ACCESS (Art. 15): Obtain a copy of personal data we hold about you.
• RIGHT TO RECTIFICATION (Art. 16): Correct inaccurate data.
• RIGHT TO ERASURE (Art. 17): Request deletion, subject to legal retention
  obligations (e.g., payment records, legal audit logs).
• RIGHT TO RESTRICTION (Art. 18): Restrict processing in certain circumstances.
• RIGHT TO DATA PORTABILITY (Art. 20): Receive your data in a structured,
  machine-readable format.
• RIGHT TO OBJECT (Art. 21): Object to processing based on legitimate interests.
• RIGHT TO WITHDRAW CONSENT: Where processing is based on consent, you may
  withdraw at any time without affecting the lawfulness of prior processing.

To exercise any right, contact ${PRIVACY_EMAIL}. We respond within 30 days.
Complex requests may be extended by a further 60 days with notice.


8. SUPERVISORY AUTHORITY

If you believe Stride has not handled your data lawfully, you have the right
to lodge a complaint with the competent data protection supervisory authority
in your country of establishment. In Italy: Garante per la protezione dei
dati personali (www.garanteprivacy.it). In Australia: OAIC (www.oaic.gov.au).


9. AUTOMATED DECISION-MAKING

Stride does not make automated decisions that produce legal or similarly
significant effects about Administrators or Members without human oversight.
AI features (e.g. the AI Copilot) provide suggestions only and do not
autonomously take decisions.


10. SECURITY

Stride implements technical and organisational measures appropriate to the
risk, including:
• Encryption in transit (TLS 1.2+) and at rest (AES-256)
• Role-based access controls with principle of least privilege
• Multi-factor authentication for administrative system access
• Regular security assessments and penetration testing
• Incident response procedures with 72-hour breach notification (GDPR Art. 33)


11. COOKIES AND TRACKING

The Stride mobile application uses only essential session tokens necessary
for authentication. No advertising cookies, cross-site tracking pixels, or
third-party analytics SDKs that share data with external ad networks are
used without your explicit consent.


12. CHILDREN'S PRIVACY

The Stride Platform is not intended for direct access by children under 13.
Your Organisation is responsible for obtaining lawful consent (typically
parental consent under GDPR Art. 8) before entering any personal data
relating to minors. Stride processes minor data solely as a Processor on
your Organisation's instructions.


13. CHANGES TO THIS POLICY

We will notify you of material changes at least 30 days before they take
effect via in-app notification and email. The current version of this Policy
is always available at stride.app/privacy and within the app under
Settings → Legal & Privacy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© ${COMPANY_NAME}. All rights reserved.`;

// ─────────────────────────────────────────────────────────────────────────────
// 3. DATA PROCESSING AGREEMENT (DPA)
//    GDPR Art. 28 compliant
//    Stride = Processor | Organisation = Controller
// ─────────────────────────────────────────────────────────────────────────────

export const DATA_PROCESSING_AGREEMENT = `STRIDE PLATFORM
DATA PROCESSING AGREEMENT (DPA)

Version ${DOC_VERSION} — Last updated: ${LAST_UPDATED}
Pursuant to GDPR Article 28

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This Data Processing Agreement ("DPA") is entered into between:

DATA CONTROLLER: The Organisation identified in the Stride onboarding wizard
("Controller", "you")

DATA PROCESSOR: ${COMPANY_NAME} ("Stride", "Processor", "we")

This DPA forms part of the Terms of Service and governs Stride's processing
of personal data on behalf of the Controller.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SUBJECT MATTER, NATURE, AND DURATION OF PROCESSING

1.1 Stride processes personal data on behalf of the Controller for the
purpose of providing the Stride association management platform Services
as described in the Terms of Service.

1.2 Processing activities include: storing and retrieving member records;
processing attendance and check-in data; facilitating payment transactions;
managing document signing and consent records; and delivering push
notifications to members and guardians.

1.3 Processing duration: for the term of the active subscription, plus the
30-day post-termination retention period, plus any additional period required
by applicable law or legal hold.


2. CATEGORIES OF DATA SUBJECTS AND PERSONAL DATA

2.1 CATEGORIES OF DATA SUBJECTS
• Adult members and staff of the Controller's Organisation
• Minor students (children) enrolled by the Organisation
• Parents and legal guardians of minor members
• Operators, coaches, and administrators of the Organisation

2.2 CATEGORIES OF PERSONAL DATA
• Identification data: name, date of birth, profile photo
• Contact data: email address, phone number, postal address
• Health and safety data: allergy information, medication notes,
  medical waiver preferences, emergency contact details
• Financial data: payment transaction records, invoicing history
• Attendance data: check-in/check-out logs, presence records
• Legal consent data: e-signatures, document acceptance records
• Technical identifiers: device tokens (for push notifications),
  QR code identifiers

2.3 SPECIAL CATEGORIES. Health and allergy data constitutes special category
data under GDPR Art. 9. The Controller is responsible for ensuring a lawful
basis (typically explicit consent under Art. 9(2)(a)) is in place before
entering such data. Stride processes this data solely on the Controller's
instructions.


3. PROCESSOR OBLIGATIONS

Stride shall, in its capacity as Processor:

3.1 PROCESSING ON INSTRUCTIONS. Process personal data only on documented
instructions from the Controller (as reflected in the Platform configuration
and these Terms), unless legally required to do otherwise. Stride shall
immediately inform the Controller if it believes an instruction infringes
GDPR or other applicable data protection law.

3.2 CONFIDENTIALITY. Ensure that authorised personnel are subject to binding
obligations of confidentiality with respect to Member Data.

3.3 SECURITY (GDPR Art. 32). Implement appropriate technical and organisational
measures to ensure a level of security appropriate to the risk, including:
(a) Pseudonymisation and encryption of personal data where appropriate;
(b) Ongoing confidentiality, integrity, availability, and resilience of systems;
(c) Ability to restore access and availability in a timely manner following
    a physical or technical incident;
(d) Regular testing and evaluation of security measures.

3.4 SUB-PROCESSORS (GDPR Art. 28(2)). Not engage sub-processors without
prior specific or general written authorisation of the Controller. General
authorisation is granted by the Controller by accepting this DPA; current
sub-processors are listed at stride.app/subprocessors. Stride will inform
the Controller of any intended addition or replacement of sub-processors
with at least 14 days' notice, giving the Controller the opportunity to
object. Sub-processors are bound by equivalent data protection obligations.

3.5 ASSISTANCE TO CONTROLLER. Assist the Controller in fulfilling its
obligations to respond to data subject rights requests (access, rectification,
erasure, portability, restriction, objection) in a timely manner, taking into
account the nature of the processing and information available to Stride.

3.6 DATA BREACH NOTIFICATION. Notify the Controller without undue delay
(and in any event within 72 hours of becoming aware) of any personal data
breach that affects Member Data. Notification will include: nature of the
breach; categories and approximate number of data subjects affected;
categories and approximate number of records affected; likely consequences;
measures taken or proposed.

3.7 PRIVACY IMPACT ASSESSMENTS. Assist the Controller, where requested and
to the extent reasonably possible, in carrying out data protection impact
assessments (DPIAs) required under GDPR Art. 35 in relation to Stride's
processing activities.

3.8 DELETION AND RETURN. Upon termination of the Services:
(a) At the Controller's choice, delete or return all Member Data;
(b) Delete existing copies within 30 days of termination, unless applicable
    law requires longer retention;
(c) Provide written confirmation of deletion upon request.

3.9 AUDIT AND INSPECTION. Make available to the Controller all information
necessary to demonstrate compliance with GDPR Art. 28 and allow for and
contribute to audits and inspections conducted by the Controller or its
appointed auditor. Requests for audits must be submitted with at least
30 days' advance notice to ${LEGAL_EMAIL} and must not unreasonably disrupt
Stride's operations.

3.10 STRIDE ACCESS RESTRICTION. Stride staff do not routinely access Member
Data. Any access for technical support is break-glass only, requires
management authorisation, and is fully logged. Stride maintains an internal
audit trail of all staff access to production systems containing Member Data.


4. CONTROLLER OBLIGATIONS

The Controller shall:

4.1 Ensure that it has a lawful basis for each category of personal data
entered into the Platform, including appropriate consents from members and
guardians where required.

4.2 Provide accurate and complete instructions to Stride and ensure those
instructions comply with applicable data protection law.

4.3 Ensure that minor members' data is only entered with the prior written
consent of a parent or legal guardian.

4.4 Maintain its own record of processing activities as required by GDPR
Art. 30, covering the processing for which it is the Controller.

4.5 Promptly notify Stride at ${LEGAL_EMAIL} of any legal hold, regulatory
investigation, or court order that may affect Member Data.


5. INTERNATIONAL TRANSFERS

Any transfer of personal data outside the EEA by Stride (including via
sub-processors) shall be governed by: (a) an adequacy decision; (b) Standard
Contractual Clauses as adopted by the European Commission; or (c) other
appropriate safeguards under GDPR Ch. V.


6. GOVERNING LAW AND JURISDICTION

This DPA is governed by the laws of the EU and the applicable national
law of the Controller's place of establishment. Italian Organisations are
additionally governed by D.Lgs. 196/2003 (Codice Privacy) as amended.


7. CONFLICT

In case of conflict between this DPA and the Terms of Service on data
protection matters, this DPA shall prevail.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© ${COMPANY_NAME}. All rights reserved.`;

// ─────────────────────────────────────────────────────────────────────────────
// 4. MEDIA CONSENT POLICY TEMPLATE
//    For Associations to use with their own members
// ─────────────────────────────────────────────────────────────────────────────

export const MEDIA_CONSENT_TEMPLATE = `[NOME ASSOCIAZIONE] — [ORGANISATION NAME]
INFORMATIVA E MODULO DI CONSENSO PER IMMAGINI E MEDIA
MEDIA AND IMAGE CONSENT FORM

Versione: 1.0 — Data: ___________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ISTRUZIONI PER L'ASSOCIAZIONE / INSTRUCTIONS FOR THE ORGANISATION:
Questo è un modello. Inserire il nome dell'associazione, il logo, e le
informazioni di contatto del responsabile del trattamento nei campi indicati
con []. Questo documento deve essere adattato al proprio contesto specifico
e verificato da un legale prima dell'utilizzo.

This is a template. Insert the organisation name, logo, and data controller
contact details in the fields marked []. This document must be adapted to
your specific context and reviewed by a legal professional before use.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TITOLARE DEL TRATTAMENTO / DATA CONTROLLER

[NOME ASSOCIAZIONE] con sede in [INDIRIZZO COMPLETO], C.F./P.IVA [NUMERO],
nella persona del legale rappresentante pro tempore.

Contatto per la privacy: [EMAIL PRIVACY ASSOCIAZIONE]
Responsabile del Trattamento (se nominato): [NOME DPO]


1. FINALITÀ DEL TRATTAMENTO / PURPOSE OF PROCESSING

L'Associazione raccoglie immagini fotografiche e video dei soci e dei
partecipanti alle attività (inclusi i minori, previo consenso del genitore/
tutore) per le seguenti finalità:

(a) UTILIZZO INTERNO: documentazione delle attività a scopo organizzativo
    interno, archivio storico dell'associazione, report per gli organi associativi.

(b) COMUNICAZIONE ISTITUZIONALE: sito web ufficiale dell'associazione,
    newsletter, materiali didattici e informativi, rapporti con enti pubblici.

(c) COMUNICAZIONE PROMOZIONALE: profili social media ufficiali dell'associazione,
    materiale promozionale, locandine, comunicati stampa.

The Organisation collects photographs and video recordings of members and
activity participants (including minors, subject to parental/guardian consent)
for the following purposes:

(a) INTERNAL USE: activity documentation for internal organisational purposes,
    historical archive, reports for governing bodies.

(b) INSTITUTIONAL COMMUNICATIONS: official organisation website, newsletters,
    educational and informational materials, reports to public bodies.

(c) PROMOTIONAL COMMUNICATIONS: official social media profiles, promotional
    materials, posters, press releases.


2. BASE GIURIDICA / LEGAL BASIS

Il trattamento si basa sul consenso esplicito dell'interessato (o del
genitore/tutore per i minori) ai sensi dell'Art. 6(1)(a) e, per immagini
di minori, dell'Art. 8 del Regolamento UE 2016/679 (GDPR).

Processing is based on the explicit consent of the data subject (or parent/
guardian for minors) under GDPR Art. 6(1)(a) and, for minors, Art. 8.


3. LIVELLI DI CONSENSO / CONSENT LEVELS

Il consenso è strutturato in tre livelli. Il livello scelto viene registrato
elettronicamente nell'app Stride con timestamp, indirizzo IP e firma digitale.

Consent is structured at three levels, recorded electronically in the Stride
app with timestamp, IP address, and digital signature.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☐ OPZIONE A — NESSUN CONSENSO / NO CONSENT
Rifiuto qualsiasi utilizzo di immagini che mi ritraggono (o che ritraggono
il/la minore per cui esercito la responsabilità genitoriale).

I refuse any use of images depicting me (or the minor for whom I hold
parental responsibility).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☐ OPZIONE B — USO INTERNO SOLTANTO / INTERNAL USE ONLY
Acconsento all'utilizzo di immagini esclusivamente per finalità interne
all'associazione (archivio, documentazione organizzativa interna).
NON autorizzo la pubblicazione su siti web, social media, o materiali
promozionali.

I consent to the use of images for internal organisational purposes only.
I do NOT authorise publication on websites, social media, or promotional materials.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☐ OPZIONE C — CONSENSO PIENO / FULL CONSENT
Acconsento all'utilizzo di immagini per tutte le finalità indicate al
punto 1 (utilizzo interno, comunicazione istituzionale e promozionale),
inclusa la pubblicazione su sito web e canali social dell'associazione.

I consent to the use of images for all purposes listed in section 1
(internal, institutional, and promotional), including publication on
the organisation's website and social media channels.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


4. CONSERVAZIONE / RETENTION

Le immagini sono conservate per [NUMERO ANNI] anni dalla data di raccolta,
o fino alla revoca del consenso. Al termine del periodo di conservazione,
il materiale viene eliminato in modo sicuro.

Images are retained for [NUMBER OF YEARS] years from the date of collection,
or until consent is withdrawn. After the retention period, material is
securely deleted.


5. COMUNICAZIONE A TERZI / THIRD-PARTY DISCLOSURE

Le immagini non vengono cedute, vendute o comunicate a soggetti terzi
per finalità commerciali o di profilazione. Possono essere condivise
con enti pubblici o federazioni sportive nell'ambito di rendicontazioni
istituzionali, previo consenso ove richiesto dalla legge.

Images are not sold or disclosed to third parties for commercial or
profiling purposes. They may be shared with public bodies or sports
federations for institutional reporting, subject to consent where
required by law.


6. DIRITTI DELL'INTERESSATO / DATA SUBJECT RIGHTS

In qualsiasi momento potete esercitare i diritti di: accesso, rettifica,
cancellazione (revoca del consenso), limitazione del trattamento,
opposizione, portabilità, contattando [EMAIL PRIVACY ASSOCIAZIONE].

La revoca del consenso non pregiudica la liceità del trattamento
effettuato prima della revoca.

You may exercise your rights of access, rectification, erasure (withdrawal
of consent), restriction, objection, and portability at any time by
contacting [EMAIL PRIVACY ASSOCIAZIONE].

Withdrawal of consent does not affect the lawfulness of processing
conducted before withdrawal.


7. DIRITTO DI RECLAMO / RIGHT TO LODGE A COMPLAINT

Avete diritto di proporre reclamo al Garante per la Protezione dei Dati
Personali (www.garanteprivacy.it) o all'autorità di controllo competente
nel vostro Paese di residenza.

You have the right to lodge a complaint with the Garante per la Protezione
dei Dati Personali (www.garanteprivacy.it) or the competent supervisory
authority in your country of residence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DICHIARAZIONE DEL CONSENZIENTE / DECLARANT'S STATEMENT

Dichiaro di aver letto e compreso la presente informativa e di esprimere
il consenso indicato sopra liberamente e consapevolmente.

I declare that I have read and understood this notice and that I give the
indicated consent freely and knowingly.

Nome e Cognome (genitore/tutore se minorenne):
Full Name (parent/guardian if minor): _____________________________________

In qualità di / As:
☐ Socio adulto / Adult member
☐ Genitore/Tutore del minore (nome del minore): ___________________________

Firma digitale / Digital Signature: [registrata tramite Stride app / recorded via Stride app]
Data / Date: [registrata automaticamente / recorded automatically]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTA: Questo documento è un modello fornito da Stride come strumento operativo.
Stride non è responsabile della conformità legale del documento adattato
dall'Associazione. Si raccomanda la revisione da parte di un consulente legale.

NOTE: This document is a template provided by Stride as an operational tool.
Stride is not responsible for the legal compliance of the document as adapted
by the Organisation. Review by a legal professional is strongly recommended.`;

// ─────────────────────────────────────────────────────────────────────────────
// 5. MEMBER PRIVACY NOTICE TEMPLATE
//    For Associations to give to their own members (GDPR Art. 13)
// ─────────────────────────────────────────────────────────────────────────────

export const MEMBER_PRIVACY_TEMPLATE = `[NOME ASSOCIAZIONE] — [ORGANISATION NAME]
INFORMATIVA SULLA PRIVACY PER I SOCI
MEMBER PRIVACY NOTICE
(Ai sensi dell'Art. 13 del Regolamento UE 2016/679 — GDPR)

Versione: 1.0 — Data: ___________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ISTRUZIONI: Questo è un modello da personalizzare con i dati della vostra
associazione. Fare revisionare da un legale o DPO prima dell'utilizzo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. IDENTITÀ E DATI DI CONTATTO DEL TITOLARE

Titolare del trattamento: [NOME ASSOCIAZIONE]
Sede: [INDIRIZZO COMPLETO]
Codice Fiscale / Partita IVA: [NUMERO]
Rappresentante legale: [NOME E COGNOME]
Responsabile della protezione dei dati (RPD/DPO): [SE NOMINATO]
Email privacy: [EMAIL PRIVACY]
Telefono: [NUMERO]


2. DATI RACCOLTI E FINALITÀ DEL TRATTAMENTO

L'Associazione raccoglie e tratta i dati personali indicati di seguito
per le finalità e con le basi giuridiche specificate:

DATI ANAGRAFICI E DI CONTATTO
(nome, cognome, data di nascita, indirizzo, email, telefono, codice fiscale)
Finalità: iscrizione e gestione del rapporto associativo
Base giuridica: Art. 6(1)(b) — esecuzione del contratto associativo

DATI DI SALUTE E SICUREZZA
(allergie, farmaci, note mediche, consenso intervento di emergenza)
Finalità: tutela della salute e sicurezza del socio durante le attività
Base giuridica: Art. 9(2)(a) GDPR — consenso esplicito + Art. 9(2)(f) —
accertamento, esercizio o difesa di un diritto in sede giudiziaria

DATI DI PRESENZA E FREQUENZA
(registrazioni di ingresso/uscita, frequenza alle lezioni)
Finalità: gestione delle attività associative e rendicontazione
Base giuridica: Art. 6(1)(b) — esecuzione del contratto associativo

DATI DI PAGAMENTO
(ricevute, storico pagamenti — dati carta non memorizzati dall'Associazione)
Finalità: gestione economica e contabilità associativa
Base giuridica: Art. 6(1)(b) contratto + Art. 6(1)(c) obbligo legale

DATI DI FIRMA ELETTRONICA
(firma digitale, timestamp, indirizzo IP, hash del documento)
Finalità: prova del consenso e conformità normativa
Base giuridica: Art. 6(1)(c) — obbligo legale

IMMAGINI E MATERIALE MULTIMEDIALE (se consenso espresso)
(fotografie e video relativi alle attività)
Finalità: comunicazione istituzionale e promozionale (v. Modulo Media Consent)
Base giuridica: Art. 6(1)(a) + Art. 9(2)(a) — consenso esplicito


3. CATEGORIE PARTICOLARI DI DATI

I dati di salute (allergie, farmaci, note mediche) costituiscono "categorie
particolari" ai sensi dell'Art. 9 GDPR. Questi dati sono trattati su base
del consenso esplicito del socio (o del genitore/tutore per i minori) e
sono accessibili esclusivamente al personale autorizzato dell'Associazione
per finalità di sicurezza durante le attività.


4. STRUMENTI TECNOLOGICI UTILIZZATI — STRIDE

L'Associazione utilizza la piattaforma Stride ([NOME ASSOCIAZIONE] utilizza
Stride come strumento tecnologico). Stride è un fornitore di servizi di
trattamento dati (Responsabile del Trattamento ai sensi dell'Art. 28 GDPR).
Stride tratta i dati esclusivamente su istruzioni dell'Associazione e non
accede ai vostri dati personali per propri scopi. Per l'informativa privacy
di Stride: stride.app/privacy.


5. COMUNICAZIONE A TERZI

I vostri dati personali non vengono ceduti o venduti a terzi per finalità
commerciali. Possono essere comunicati a:
• Personale autorizzato dell'Associazione (operatori, istruttori, amministratori)
• Fornitori di servizi tecnologici vincolati da DPA (incluso Stride)
• Enti pubblici o autorità competenti quando richiesto per legge
• Federazioni sportive o enti di appartenenza per obblighi di affiliazione


6. TRASFERIMENTI INTERNAZIONALI

I dati possono essere trasferiti a fornitori di servizi tecnologici con
infrastrutture nell'EEA o in Paesi terzi dotati di garanzie adeguate
(decisione di adeguatezza o Clausole Contrattuali Standard UE).


7. PERIODO DI CONSERVAZIONE

Dati anagrafici e associativi: per la durata del rapporto associativo
più [X ANNI] anni per eventuali contestazioni.

Dati contabili e fiscali: 10 anni (obbligo di legge).

Dati di salute: per la durata dell'iscrizione; eliminati entro 30 giorni
dalla cancellazione dell'iscrizione, salvo obbligo legale di conservazione.

Immagini (con consenso): [NUMERO] anni, o fino alla revoca del consenso.

Firma elettronica e audit log: 7 anni.


8. DIRITTI DELL'INTERESSATO

Ai sensi degli Artt. 15-22 GDPR, avete il diritto di:

• ACCESSO (Art. 15): Ottenere conferma che siano trattati dati che vi
  riguardano e riceverne copia.
• RETTIFICA (Art. 16): Ottenere la rettifica di dati inesatti.
• CANCELLAZIONE (Art. 17): Ottenere la cancellazione dei dati, nei casi
  previsti (es. revoca del consenso), salvo obblighi di conservazione legale.
• LIMITAZIONE (Art. 18): Ottenere la limitazione del trattamento in
  determinati casi.
• PORTABILITÀ (Art. 20): Ricevere i dati in formato strutturato e leggibile.
• OPPOSIZIONE (Art. 21): Opporvi al trattamento per motivi legittimi.
• REVOCA DEL CONSENSO: In qualsiasi momento, senza pregiudizio per la
  liceità del trattamento precedente alla revoca.

Per esercitare i vostri diritti: [EMAIL PRIVACY]
Rispondiamo entro 30 giorni dalla ricezione della richiesta.


9. DIRITTO DI RECLAMO

Avete il diritto di proporre reclamo al Garante per la Protezione dei
Dati Personali: www.garanteprivacy.it | Piazza Venezia 11, 00187 Roma.


10. MODIFICHE ALLA PRESENTE INFORMATIVA

Le modifiche materiali vengono comunicate con almeno 30 giorni di preavviso
tramite email o notifica nell'app. La versione aggiornata è sempre disponibile
presso la sede associativa e nell'app Stride (Documenti).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTA: Questo documento è un modello fornito da Stride come supporto
all'adempimento normativo. L'Associazione rimane responsabile della
conformità legale del documento finale. Stride non fornisce consulenza
legale. Si raccomanda la revisione da parte di un consulente legale o DPO.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
© [NOME ASSOCIAZIONE]. Tutti i diritti riservati.`;

// ─────────────────────────────────────────────────────────────────────────────
// Document index (used by the download endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export interface LegalDocMeta {
  id: string;
  title: string;
  subtitle: string;
  version: string;
  text: string;
}

export const LEGAL_DOCS: Record<string, LegalDocMeta> = {
  "terms": {
    id: "terms",
    title: "Terms of Service",
    subtitle: "Termini di Servizio",
    version: DOC_VERSION,
    text: TERMS_OF_SERVICE,
  },
  "privacy": {
    id: "privacy",
    title: "Privacy Policy",
    subtitle: "Informativa sulla Privacy",
    version: DOC_VERSION,
    text: PRIVACY_POLICY,
  },
  "dpa": {
    id: "dpa",
    title: "Data Processing Agreement",
    subtitle: "Accordo sul Trattamento dei Dati (DPA)",
    version: DOC_VERSION,
    text: DATA_PROCESSING_AGREEMENT,
  },
  "media-consent": {
    id: "media-consent",
    title: "Media Consent Form Template",
    subtitle: "Modello Consenso Media (per i vostri Soci)",
    version: DOC_VERSION,
    text: MEDIA_CONSENT_TEMPLATE,
  },
  "member-privacy": {
    id: "member-privacy",
    title: "Member Privacy Notice Template",
    subtitle: "Modello Informativa Privacy Soci",
    version: DOC_VERSION,
    text: MEMBER_PRIVACY_TEMPLATE,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HTML generator — produces a print-ready, save-to-PDF document
// ─────────────────────────────────────────────────────────────────────────────

export function generateDocumentHtml(doc: LegalDocMeta): string {
  const escaped = doc.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${doc.title} — Stride Platform</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 13pt;
    line-height: 1.65;
    color: #1a1a1a;
    background: #fff;
    max-width: 820px;
    margin: 0 auto;
    padding: 48px 56px 72px;
  }
  .cover {
    text-align: center;
    padding: 60px 0 48px;
    border-bottom: 3px solid #1E3A8A;
    margin-bottom: 48px;
  }
  .cover-logo {
    font-size: 11pt;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-weight: 800;
    letter-spacing: 6px;
    color: #1E3A8A;
    text-transform: uppercase;
    margin-bottom: 32px;
  }
  .cover-title {
    font-size: 26pt;
    font-weight: 700;
    color: #1E3A8A;
    line-height: 1.2;
    margin-bottom: 12px;
  }
  .cover-subtitle {
    font-size: 14pt;
    color: #4B5563;
    font-style: italic;
    margin-bottom: 32px;
  }
  .cover-meta {
    font-size: 10pt;
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #6B7280;
    line-height: 1.8;
  }
  .cover-badge {
    display: inline-block;
    background: #FEF3C7;
    color: #92400E;
    font-size: 9pt;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-weight: 700;
    letter-spacing: 1px;
    padding: 4px 14px;
    border-radius: 20px;
    margin-top: 20px;
    text-transform: uppercase;
  }
  pre {
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 12pt;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.7;
  }
  .footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid #E5E7EB;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 9pt;
    color: #9CA3AF;
    text-align: center;
    line-height: 1.6;
  }
  @media print {
    body { padding: 20mm 20mm 30mm; }
    .cover { page-break-after: always; }
    .footer { position: fixed; bottom: 0; width: 100%; }
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-logo">⚡ Stride</div>
    <div class="cover-title">${doc.title}</div>
    <div class="cover-subtitle">${doc.subtitle}</div>
    <div class="cover-meta">
      Version ${doc.version} &nbsp;·&nbsp; ${LAST_UPDATED}<br>
      stride.app/legal &nbsp;·&nbsp; ${LEGAL_EMAIL}
    </div>
    <div class="cover-badge">Confidential — Legal Document</div>
  </div>

  <pre>${escaped}</pre>

  <div class="footer">
    © ${COMPANY_NAME} &nbsp;·&nbsp; ${LAST_UPDATED} &nbsp;·&nbsp; Version ${DOC_VERSION}<br>
    This document is subject to change. The current version is always available at stride.app/legal<br>
    To print to PDF: File → Print → Save as PDF
  </div>
</body>
</html>`;
}
