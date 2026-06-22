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
    title: "Terms of Service",
    required: true,
    checkLabel: "I have read and accept the Stride Terms of Service",
    body: `These Terms of Service ("Terms") constitute a legally binding agreement between you ("Association", "Operator", "you") and Stride Platform ("Stride", "we", "us") governing your access to and use of the Stride platform and services.

1. SUBSCRIPTION AND FEES. Stride operates on a subscription basis. You agree to pay the applicable fees as set out in your selected plan. Fees are billed monthly or annually in advance and are non-refundable. Stride reserves the right to modify fees with 30 days' notice. Failure to pay may result in suspension of services.

2. PERMITTED USE. You may use Stride solely for managing your association's operations including member management, scheduling, attendance, payments, and communications. You must not use the platform for unlawful purposes, to transmit harmful content, or to violate any third party's rights.

3. DATA RESPONSIBILITY. As the association administrator, you are the data controller for your members' personal data. Stride acts as a data processor. You are responsible for obtaining appropriate consents from your members and complying with applicable data protection legislation including GDPR where applicable.

4. INTELLECTUAL PROPERTY. All rights in the Stride platform, software, and documentation remain the property of Stride. You are granted a limited, non-exclusive, non-transferable licence to use the platform during your subscription period.

5. LIMITATION OF LIABILITY. To the maximum extent permitted by law, Stride's total liability shall not exceed the fees paid by you in the 3 months preceding the claim. Stride shall not be liable for any indirect, incidental, or consequential damages.

6. TERMINATION. Either party may terminate this agreement with 30 days' written notice. Upon termination, your data will be retained for 30 days and then permanently deleted in accordance with our Data Deletion Policy.

7. GOVERNING LAW. These Terms are governed by applicable law in the jurisdiction where Stride is registered. Disputes shall be resolved through binding arbitration before recourse to courts.`,
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    required: true,
    checkLabel: "I have read and accept the Stride Privacy Policy",
    body: `This Privacy Policy explains how Stride Platform ("Stride") collects, uses, stores, and protects personal data in connection with our association management services.

DATA WE COLLECT. We collect data you provide during registration (name, email, address, phone, organisational details), data generated through use of the platform (activity logs, attendance records, payment transactions), and technical data (IP addresses, device identifiers, browser information) for security and operational purposes.

HOW WE USE YOUR DATA. Your data is used to: (a) provide and maintain the Stride service; (b) process payments via Stripe; (c) communicate with you about your account and service updates; (d) comply with legal obligations; (e) improve the platform through anonymised analytics.

DATA SHARING. We share personal data only with: (i) your designated administrators and operators within your account; (ii) payment processor Stripe for transaction processing; (iii) cloud infrastructure providers (AWS, Supabase) under data processing agreements; (iv) law enforcement or regulatory bodies when legally required.

YOUR RIGHTS. Under applicable data protection law, you have the right to: access your personal data; correct inaccurate data; request erasure ("right to be forgotten"); restrict processing; data portability; and object to processing. To exercise these rights, contact info@stride-ops.com.

RETENTION. We retain active account data for the duration of your subscription plus 30 days following account closure. Financial transaction records may be retained for up to 7 years for legal and tax compliance. Anonymised aggregated statistics may be retained indefinitely.

SECURITY. We implement industry-standard security measures including encryption at rest and in transit, access controls, and regular security audits. No system is completely secure; please notify us immediately of any suspected breach.

CONTACT. For privacy queries: info@stride-ops.com.`,
  },
  {
    id: "dpa",
    title: "Data Processing Agreement (DPA)",
    required: true,
    checkLabel: "I accept the Data Processing Agreement (Article 28 GDPR)",
    body: `This Data Processing Agreement ("DPA") forms part of the agreement between the Association ("Controller") and Stride Platform ("Processor") and applies where Stride processes personal data on behalf of the Association.

1. ROLES. The Association is the data controller and determines the purposes and means of processing. Stride is the data processor and processes personal data solely on documented instructions from the Controller.

2. PROCESSING DETAILS. Subject matter: Association management services. Duration: For the term of the subscription. Nature and purpose: Storage, retrieval, organisation, and transmission of member data. Types of data: Names, contact details, attendance records, payment data. Categories of data subjects: Association members, dependants, and staff.

3. PROCESSOR OBLIGATIONS. Stride undertakes to: (a) process personal data only on documented instructions; (b) ensure that authorised personnel are bound by confidentiality; (c) implement appropriate technical and organisational security measures under Article 32 GDPR; (d) assist the Controller in responding to data subject rights requests; (e) notify the Controller without undue delay upon becoming aware of a personal data breach; (f) delete or return all personal data upon termination of services; (g) provide all information necessary to demonstrate compliance.

4. SUB-PROCESSORS. Stride uses the following approved sub-processors: Supabase Inc. (database hosting), Amazon Web Services (infrastructure), Stripe Inc. (payment processing). Stride will notify the Controller of any intended changes to sub-processors with 30 days' advance notice.

5. INTERNATIONAL TRANSFERS. Where personal data is transferred outside the EEA, Stride relies on Standard Contractual Clauses approved by the European Commission to ensure adequate protection.

6. SECURITY MEASURES. Stride implements: encryption of personal data at rest (AES-256) and in transit (TLS 1.3); access control and authentication measures; regular security testing; incident response procedures; and physical security controls at hosting facilities.`,
  },
  {
    id: "deletion",
    title: "Data Deletion Policy",
    required: true,
    checkLabel: "I understand and accept the Data Deletion Policy (30-day auto-deletion)",
    body: `This Data Deletion Policy describes how Stride Platform manages the deletion of personal data upon account termination or cancellation.

ACCOUNT CLOSURE PROCESS. When an association account is closed (whether by the association's request, non-payment, or expiry), the following deletion schedule applies:

IMMEDIATE (Day 0): Access to the platform is revoked. No new data may be processed. All sessions are invalidated.

GRACE PERIOD (Days 1–30): Data is preserved in a restricted-access backup state. During this period, you may contact info@stride-ops.com to request data export or account reinstatement. No routine access is available during this period.

AUTOMATIC DELETION (Day 30): All personal data associated with the account is permanently and irrecoverably deleted from Stride's active systems, including: member profiles and contact information; attendance and activity records; document signatures; uploaded files and media; communications and notifications; QR codes and access tokens.

RETAINED DATA. The following categories of data may be retained beyond 30 days for legal and regulatory compliance: anonymised and aggregated statistics (with no personally identifiable information); financial transaction records required for tax and accounting purposes (retained for up to 7 years); audit logs related to security incidents (retained for up to 3 years).

MEMBER DATA AFTER ASSOCIATION DELETION. Where a member's personal data was collected by the association, the association (as controller) is responsible for notifying members of account closure and data deletion. Stride will not independently notify individual members unless legally required.

DATA EXPORT. Before account closure, we recommend exporting your data using the Export function in Admin Settings. Stride cannot guarantee data recovery after the 30-day grace period expires.

TO REQUEST DELETION: Email info@stride-ops.com with your account details and "DATA DELETION REQUEST" in the subject line.`,
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
