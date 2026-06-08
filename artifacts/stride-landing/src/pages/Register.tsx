import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CurrencyKey = "AUD" | "EUR" | "GBP" | "USD";

const ORG_TYPES = [
  { value: "dance_studio",   label: "Dance Studio" },
  { value: "gym_fitness",    label: "Gym & Fitness Centre" },
  { value: "martial_arts",   label: "Martial Arts Academy" },
  { value: "sports_academy", label: "Sports Academy" },
  { value: "gymnastics",     label: "Gymnastics Club" },
  { value: "cheerleading",   label: "Cheerleading Squad" },
  { value: "association",    label: "Cultural / Sports Association" },
  { value: "other",          label: "Other" },
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

const TOTAL = 4;

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        {Array.from({ length: TOTAL }, (_, i) => i + 1).map(n => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 transition-colors
              ${n < step  ? "bg-emerald-500 text-white"
              : n === step ? "bg-[#D4AF37] text-[#0A192F]"
              : "bg-white/10 text-slate-400"}`}>
              {n < step ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : n}
            </div>
            {n < TOTAL && (
              <div className={`flex-1 h-0.5 rounded-full transition-colors ${n < step ? "bg-emerald-500" : "bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 font-medium">
        <span className={step >= 1 ? "text-[#D4AF37]" : ""}>School</span>
        <span className={step >= 2 ? "text-[#D4AF37]" : ""}>Account</span>
        <span className={step >= 3 ? "text-[#D4AF37]" : ""}>Payments</span>
        <span className={step >= 4 ? "text-[#D4AF37]" : ""}>Launch</span>
      </div>
    </div>
  );
}

// ── Input styles ──────────────────────────────────────────────────────────────

const inputCls = "w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors";
const selectCls = `${inputCls} appearance-none cursor-pointer`;
const labelCls = "block text-sm font-semibold text-slate-300 mb-2";

// ── Logo ──────────────────────────────────────────────────────────────────────

const Logo = () => (
  <svg height="28" width="28" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="9" fill="#1E3A8A" />
    <path d="M9 18h18M18 10l8 8-8 8" stroke="#D4AF37" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function Register() {
  const [step, setStep] = useState(1);

  // Step 1 — School details
  const [schoolName, setSchoolName] = useState("");
  const [orgType,    setOrgType]    = useState("dance_studio");
  const [country,    setCountry]    = useState("AU");

  // Step 2 — Admin account
  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirmPwd,  setConfirmPwd]  = useState("");
  const [showPwd,     setShowPwd]     = useState(false);

  // Step 4 — terms
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Meta
  const [error,          setError]         = useState("");
  const [loading,        setLoading]        = useState(false);
  const [submitted,      setSubmitted]      = useState(false);
  const [activationUrl,  setActivationUrl]  = useState<string | null>(null);

  const countryData = COUNTRIES.find(c => c.value === country) ?? COUNTRIES[0];
  const currency    = countryData.currency;

  // ── Validation per step ────────────────────────────────────────────────────

  const next = () => {
    setError("");
    if (step === 1) {
      if (!schoolName.trim()) { setError("Please enter your school name."); return; }
    }
    if (step === 2) {
      if (!firstName.trim() || !lastName.trim()) { setError("Please enter your full name."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (password !== confirmPwd) { setError("Passwords do not match."); return; }
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    setError("");
    if (!agreedTerms) { setError("Please accept the Terms of Service to continue."); return; }
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
          org_name:    schoolName.trim(),
          org_type:    orgType,
          country,
          currency,
          role:        "admin",
          source:      "web_registration",
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
      <div className="min-h-screen bg-[#0A192F] flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full">
          <div className="bg-[#112240] border border-[#D4AF37]/30 rounded-2xl p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-[#D4AF37]/10 border-2 border-[#D4AF37]/40 flex items-center justify-center mx-auto mb-6">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Check Your Inbox</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              We sent a verification link to <strong className="text-[#D4AF37]">{email}</strong>.
              Click it to activate your account, then download Stride and log in as Administrator.
            </p>

            <div className="flex flex-col gap-3 text-left mb-6">
              {[
                { n: "1", t: "Open the email from Stride" },
                { n: "2", t: "Click 'Activate My Account'" },
                { n: "3", t: "Download Stride & log in as Admin" },
                { n: "4", t: "Go to Settings → Billing to connect Stripe" },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-3 bg-[#0A192F] rounded-xl px-4 py-3">
                  <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-[#0A192F] text-xs font-black flex items-center justify-center flex-shrink-0">{s.n}</span>
                  <span className="text-slate-300 text-sm">{s.t}</span>
                </div>
              ))}
            </div>

            {activationUrl && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5">
                <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Dev — Activation Link</p>
                <a href={activationUrl} className="text-[#D4AF37] text-xs break-all underline hover:text-[#e8c44b] transition-colors">
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
    <div className="min-h-screen bg-[#0A192F] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 no-underline mb-6">
            <Logo />
            <span className="text-white font-bold text-lg tracking-wide">Stride Platform</span>
          </a>
          <h1 className="text-3xl font-black text-white mb-2">Register Your School</h1>
          <p className="text-slate-400 text-sm">
            Start your free 30-day trial. No credit card required.
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#112240] border border-[#D4AF37]/20 rounded-2xl p-8">
          <ProgressBar step={step} />

          {/* ── Step 1: School Details ─────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">About Your School</p>
                <p className="text-slate-400 text-sm">Tell us about your organisation.</p>
              </div>
              <div>
                <label className={labelCls}>School / Organisation Name</label>
                <input type="text" className={inputCls} placeholder="Elite Dance Academy"
                  value={schoolName} onChange={e => { setSchoolName(e.target.value); setError(""); }}
                  autoFocus />
              </div>
              <div>
                <label className={labelCls}>Organisation Type</label>
                <div className="relative">
                  <select className={selectCls} value={orgType}
                    onChange={e => setOrgType(e.target.value)}>
                    {ORG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <div className="relative">
                  <select className={selectCls} value={country}
                    onChange={e => setCountry(e.target.value)}>
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                <p className="text-slate-500 text-xs mt-1.5">Billing currency: <strong className="text-slate-300">{currency}</strong></p>
              </div>
            </div>
          )}

          {/* ── Step 2: Admin Account ──────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">Administrator Account</p>
                <p className="text-slate-400 text-sm">You'll be the primary admin for {schoolName || "your school"}.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First Name</label>
                  <input type="text" className={inputCls} placeholder="Jane"
                    value={firstName} onChange={e => { setFirstName(e.target.value); setError(""); }} autoFocus />
                </div>
                <div>
                  <label className={labelCls}>Last Name</label>
                  <input type="text" className={inputCls} placeholder="Smith"
                    value={lastName} onChange={e => { setLastName(e.target.value); setError(""); }} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email Address</label>
                <input type="email" className={inputCls} placeholder="jane@youracademy.com"
                  value={email} onChange={e => { setEmail(e.target.value); setError(""); }} />
              </div>
              <div>
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <input type={showPwd ? "text" : "password"} className={inputCls + " pr-10"}
                    placeholder="Min. 8 characters" value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }} />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
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
                <label className={labelCls}>Confirm Password</label>
                <input type="password" className={inputCls} placeholder="Repeat password"
                  value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setError(""); }} />
              </div>
            </div>
          )}

          {/* ── Step 3: Stripe Connect (informational) ─────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">Payment Setup</p>
                <p className="text-slate-400 text-sm">How Stride handles payments for your school.</p>
              </div>

              <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <span className="text-emerald-300 font-bold text-sm">Powered by Stripe Connect</span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Member fees go directly into your Stripe account — Stride never holds your money.
                  You connect your Stripe account from the app after registration.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ),
                    title: "0% platform commission on member payments",
                    desc:  "What your members pay goes directly to you, minus standard Stripe processing fees.",
                  },
                  {
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ),
                    title: "Automated operator payroll",
                    desc:  "Set earnings per operator and Stride routes payouts automatically at the end of each period.",
                  },
                  {
                    icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ),
                    title: "Connect from Admin Settings after sign-up",
                    desc:  "Go to Admin → Billing → Stripe Connect and complete the setup in minutes.",
                  },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex gap-3 bg-[#0A192F] rounded-xl px-4 py-3">
                    <span className="mt-0.5 flex-shrink-0">{icon}</span>
                    <div>
                      <p className="text-white text-sm font-semibold">{title}</p>
                      <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-3 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl p-4">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-slate-400 text-xs leading-relaxed">
                  You don't need to connect Stripe right now. Your trial runs without it.
                  Connect when you're ready to start taking member payments.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 4: Review & Launch ────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">Review &amp; Launch</p>
                <p className="text-slate-400 text-sm">Confirm your details and start your free trial.</p>
              </div>

              <div className="bg-[#0A192F] rounded-xl p-5 space-y-3 border border-[#D4AF37]/15">
                {[
                  { label: "School Name", value: schoolName },
                  { label: "Type",        value: ORG_TYPES.find(t => t.value === orgType)?.label ?? orgType },
                  { label: "Country",     value: countryData.label },
                  { label: "Currency",    value: currency },
                  { label: "Admin Name",  value: `${firstName} ${lastName}` },
                  { label: "Admin Email", value: email },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">{label}</span>
                    <span className="text-white text-sm font-semibold">{value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-[#1E3A8A]/20 border border-[#1E3A8A]/30 rounded-xl p-4">
                <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-2">What happens next</p>
                <ul className="space-y-1.5">
                  {[
                    "Verification email sent immediately",
                    "30-day free trial starts on activation",
                    "Stripe Connect — connect from the app anytime",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-slate-300 text-xs">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedTerms}
                  onChange={e => { setAgreedTerms(e.target.checked); setError(""); }}
                  className="mt-0.5 accent-[#D4AF37] w-4 h-4 flex-shrink-0" />
                <span className="text-slate-400 text-xs leading-relaxed">
                  I agree to Stride&apos;s{" "}
                  <a href="/terms"   target="_blank" className="text-[#D4AF37] hover:underline">Terms of Service</a>
                  {" "}and{" "}
                  <a href="/privacy" target="_blank" className="text-[#D4AF37] hover:underline">Privacy Policy</a>.
                </span>
              </label>
            </div>
          )}

          {/* ── Error ─────────────────────────────────────────────────── */}
          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────────── */}
          <div className={`flex gap-3 mt-6 ${step > 1 ? "flex-row" : "flex-col"}`}>
            {step > 1 && (
              <button type="button" onClick={() => { setStep(s => s - 1); setError(""); }}
                className="flex-1 bg-[#0A192F] border border-[#D4AF37]/30 text-slate-300 font-bold py-3.5 rounded-xl text-sm hover:border-[#D4AF37]/60 transition-colors">
                Back
              </button>
            )}
            {step < TOTAL ? (
              <button type="button" onClick={next}
                className="flex-1 bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors">
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
                    Creating your school…
                  </>
                ) : "Launch My School"}
              </button>
            )}
          </div>

          <p className="text-center text-slate-500 text-xs mt-5">
            Already have an account?{" "}
            <a href="/" className="text-[#D4AF37] hover:underline font-semibold">Back to home</a>
          </p>
        </div>

      </div>
    </div>
  );
}
