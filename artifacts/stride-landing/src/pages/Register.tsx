import { useState, useEffect } from "react";

interface OrgInfo {
  orgId: number;
  orgName: string;
}

interface StepProps {
  step: number;
  total: number;
}

function ProgressBar({ step, total }: StepProps) {
  return (
    <div className="w-full mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
          Step {step} of {total}
        </span>
        <span className="text-xs text-[#D4AF37] font-semibold">
          {Math.round((step / total) * 100)}% complete
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#D4AF37]/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#D4AF37] rounded-full transition-all duration-500"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function Register() {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite") ?? "";
  const orgSlugParam = params.get("org") ?? "";
  const schoolParam = params.get("school") ? decodeURIComponent(params.get("school")!) : "";

  const [step, setStep] = useState(1);
  const TOTAL = 3;

  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [phone, setPhone]           = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd]       = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const [orgInfo, setOrgInfo]   = useState<OrgInfo | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/auth/invite/${inviteToken}`)
      .then(r => r.json())
      .then(d => { if (d.valid) setOrgInfo({ orgId: d.orgId, orgName: d.orgName }); })
      .catch(() => {});
  }, [inviteToken]);

  const schoolName = orgInfo?.orgName ?? schoolParam ?? "Your School";

  const nextStep = () => {
    setError("");
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("Please enter your first and last name."); return;
      }
    }
    if (step === 2) {
      if (!phone.trim() || phone.trim().length < 8) {
        setError("Please enter a valid phone number."); return;
      }
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address."); return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }
    if (password !== confirmPwd) {
      setError("Passwords do not match."); return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          password,
          org_slug: orgSlugParam || undefined,
          invite_token: inviteToken || undefined,
          source: "web",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }
      setActivationUrl(data.activationUrl ?? null);
      setSubmitted(true);
    } catch {
      setError("Connection error. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0A192F] flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full">
          <div className="bg-[#112240] border border-[#D4AF37]/30 rounded-2xl p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-[#D4AF37]/10 border-2 border-[#D4AF37]/40 flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">✉️</span>
            </div>
            <h2 className="text-2xl font-black text-white mb-3">Check Your Inbox</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              We sent a verification link to <strong className="text-[#D4AF37]">{email}</strong>.
              Click the link to activate your account, then download the app and log in.
            </p>

            <div className="flex flex-col gap-3 text-left mb-6">
              {[
                { n: "1", t: "Open the email from Stride" },
                { n: "2", t: "Click 'Activate My Account'" },
                { n: "3", t: "Download the Stride app & log in" },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-3 bg-[#0A192F] rounded-xl px-4 py-3">
                  <span className="w-6 h-6 rounded-full bg-[#D4AF37] text-[#0A192F] text-xs font-black flex items-center justify-center flex-shrink-0">{s.n}</span>
                  <span className="text-slate-300 text-sm">{s.t}</span>
                </div>
              ))}
            </div>

            {activationUrl && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Dev mode — activation link
                </p>
                <a
                  href={activationUrl}
                  className="text-[#D4AF37] text-xs break-all underline hover:text-[#e8c44b] transition-colors"
                >
                  {activationUrl}
                </a>
              </div>
            )}

            <a
              href="/"
              className="block w-full bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm text-center hover:bg-[#e8c44b] transition-colors"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A192F] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            <span className="text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">
              {schoolName}
            </span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Create Your Account</h1>
          <p className="text-slate-400 text-sm">
            {inviteToken
              ? `You were invited to join ${schoolName}`
              : "Join your dance school's management platform"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#112240] border border-[#D4AF37]/20 rounded-2xl p-8">
          <ProgressBar step={step} total={TOTAL} />

          {/* Step 1 — Names */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">Personal Details</p>
                <p className="text-slate-400 text-sm">Tell us your name so we can personalise your account.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">First Name</label>
                  <input
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={e => { setFirstName(e.target.value); setError(""); }}
                    className="w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Last Name</label>
                  <input
                    type="text"
                    placeholder="Smith"
                    value={lastName}
                    onChange={e => { setLastName(e.target.value); setError(""); }}
                    className="w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Phone */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">Contact Number</p>
                <p className="text-slate-400 text-sm">Your school may use this for important notifications.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Mobile Phone</label>
                <input
                  type="tel"
                  placeholder="+61 400 000 000"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setError(""); }}
                  className="w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                  autoFocus
                />
              </div>
              <div className="flex items-start gap-3 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl p-4">
                <span className="text-[#D4AF37] text-base">🔒</span>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Your phone number is shared with your school admin only and is never sold to third parties.
                </p>
              </div>
            </div>
          )}

          {/* Step 3 — Email & Password */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[#D4AF37] text-sm font-bold uppercase tracking-wider mb-1">Account Credentials</p>
                <p className="text-slate-400 text-sm">You'll use these to log into the Stride mobile app.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Email Address</label>
                <input
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  className="w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    className="w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 pr-10 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPwd ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-300 mb-2">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); setError(""); }}
                  className="w-full bg-[#0A192F] border border-[#D4AF37]/30 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Navigation */}
          <div className={`flex gap-3 mt-6 ${step > 1 ? "flex-row" : "flex-col"}`}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => { setStep(s => s - 1); setError(""); }}
                className="flex-1 bg-[#0A192F] border border-[#D4AF37]/30 text-slate-300 font-bold py-3.5 rounded-xl text-sm hover:border-[#D4AF37]/60 transition-colors"
              >
                Back
              </button>
            )}
            {step < TOTAL ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="flex-1 bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors disabled:opacity-60"
              >
                {loading ? "Creating account…" : "Create Account"}
              </button>
            )}
          </div>

          {/* Sign in link */}
          <p className="text-center text-slate-500 text-xs mt-5">
            Already have an account?{" "}
            <a href="/" className="text-[#D4AF37] hover:underline font-semibold">
              Back to home
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
