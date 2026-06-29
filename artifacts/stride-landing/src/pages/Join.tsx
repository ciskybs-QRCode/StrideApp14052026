import { useState, useEffect } from "react";
import { useRoute } from "wouter";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomField {
  id: string;
  label: string;
  type: "text" | "date" | "checkbox" | "select";
  required: boolean;
  description?: string;
  options?: string[];
}

interface CustomDocument {
  id: string;
  title: string;
  url?: string;
  content?: string;
  required: boolean;
}

interface RegistrationConfig {
  welcomeMessage?: string;
  requirePhone?: boolean;
  requireAddress?: boolean;
  customFields?: CustomField[];
  customDocuments?: CustomDocument[];
}

interface OrgData {
  orgId: number;
  orgName: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  registrationConfig: RegistrationConfig;
}

const TOTAL_BASE = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

const Logo = ({ size = 32 }: { size?: number }) => (
  <img src="/stride-logo.png" alt="Stride" style={{ height: size, width: "auto", display: "block" }} />
);

const AppStoreBadge = ({ store, primary }: { store: "ios" | "android"; primary: string }) => {
  const isIos = store === "ios";
  return (
    <a
      href={isIos
        ? "https://apps.apple.com/app/stride-app"
        : "https://play.google.com/store/apps/details?id=com.stride.app"}
      target="_blank"
      rel="noopener noreferrer"
      className="no-underline"
    >
      <div
        className="flex items-center gap-3 px-5 py-3 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
        style={{ backgroundColor: primary }}
      >
        {isIos ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M3.18 23.76c.33.18.7.24 1.07.17l12.09-6.97-2.42-2.42-10.74 9.22zm-1.55-19.3C1.32 4.82 1 5.4 1 6.12v11.76c0 .72.32 1.3.63 1.66l.09.08 6.59-6.59v-.16L1.63 6.46l-.1.1.1-.1zM20.65 10.76l-2.12-1.22-2.7 2.7 2.7 2.7 2.15-1.24c.61-.35.61-1.6-.03-1.94zM4.25.07L16.34 7.04l-2.42 2.42L3.18.24C3.51.07 3.92.13 4.25.07z" />
          </svg>
        )}
        <div>
          <div className="text-xs opacity-80 font-normal">{isIos ? "Download on the" : "Get it on"}</div>
          <div className="text-sm font-bold">{isIos ? "App Store" : "Google Play"}</div>
        </div>
      </div>
    </a>
  );
};

// ── Legal text ────────────────────────────────────────────────────────────────

const STRIDE_TC_SUMMARY = `By registering as a member of this association through the Stride platform, you agree to Stride's Terms of Service. You acknowledge that Stride provides software services to the association and is not directly responsible for the association's activities. Your account data is stored securely and processed in accordance with applicable data protection laws. You may request account deletion at any time by contacting the association administrator.`;

const STRIDE_PRIVACY_SUMMARY = `Stride collects and processes your personal data (name, email, phone, and any information you provide during registration) to operate your account and provide association management services. Your data is shared with your association's administrators and operators as necessary for service delivery. Stride does not sell your data to third parties. You have the right to access, correct, or delete your data.`;

// ── Main component ────────────────────────────────────────────────────────────

export default function Join() {
  const [, params] = useRoute<{ slug: string }>("/join/:slug");
  const slug = params?.slug ?? "";

  const [org, setOrg]     = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep]   = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [showPwd,   setShowPwd]   = useState(false);

  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({});

  const [agreedStrideTc,      setAgreedStrideTc]      = useState(false);
  const [agreedStridePrivacy, setAgreedStridePrivacy] = useState(false);
  const [agreedOrgDocs,       setAgreedOrgDocs]       = useState<Record<string, boolean>>({});
  const [expandedDoc,         setExpandedDoc]         = useState<string | null>(null);

  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState(false);

  // ── Sign-in mode (existing account) ────────────────────────────────────────
  const [mode,           setMode]           = useState<"register" | "signin">("register");
  const [signinEmail,    setSigninEmail]    = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinShowPwd,  setSigninShowPwd]  = useState(false);
  const [signinLoading,  setSigninLoading]  = useState(false);
  const [signinError,    setSigninError]    = useState("");
  const [linkResult,     setLinkResult]     = useState<{
    orgName: string; primaryColor: string; secondaryColor: string;
    logoUrl: string | null; alreadyMember: boolean;
  } | null>(null);

  const primary   = org?.primaryColor   ?? "#1E3A8A";
  const secondary = org?.secondaryColor ?? "#FBBF24";

  const cfg     = org?.registrationConfig ?? {};
  const cFields = cfg.customFields ?? [];
  const cDocs   = cfg.customDocuments ?? [];

  const hasCustomStep = cFields.length > 0;
  const TOTAL = hasCustomStep ? TOTAL_BASE + 1 : TOTAL_BASE;

  const customStep  = hasCustomStep ? 2 : null;
  const legalStep   = hasCustomStep ? 3 : 2;
  const currentMax  = TOTAL;

  // Auto-switch to sign-in mode when ?signin=1 is in the URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("signin") === "1") setMode("signin");
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      // No org slug — render the page in generic mode (no org data needed)
      setLoading(false);
      return;
    }
    fetch(`/api/public/join/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: OrgData) => { setOrg(data); setLoading(false); })
      .catch((status) => {
        setLoading(false);
        if (status === 404) setNotFound(true);
      });
  }, [slug]);

  const inputCls = `w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors`;
  const focusCls = `focus:border-[${primary}] focus:ring-2`;
  const labelCls = "block text-sm font-semibold text-slate-700 mb-1.5";

  const validateStep = (): boolean => {
    setError("");
    if (step === 1) {
      if (!firstName.trim()) { setError("First name is required."); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return false; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return false; }
      if (password !== confirm) { setError("Passwords do not match."); return false; }
      if (cfg.requirePhone && !phone.trim()) { setError("Phone number is required."); return false; }
    }
    if (customStep && step === customStep) {
      for (const f of cFields) {
        if (f.required && f.type !== "checkbox" && !customValues[f.id]) {
          setError(`"${f.label}" is required.`); return false;
        }
        if (f.required && f.type === "checkbox" && !customValues[f.id]) {
          setError(`You must acknowledge "${f.label}".`); return false;
        }
      }
    }
    if (step === legalStep) {
      if (!agreedStrideTc)      { setError("Please accept the Stride Terms of Service."); return false; }
      if (!agreedStridePrivacy) { setError("Please accept the Stride Privacy Policy."); return false; }
      for (const doc of cDocs.filter(d => d.required)) {
        if (!agreedOrgDocs[doc.id]) {
          setError(`Please accept: "${doc.title}".`); return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < currentMax) setStep(s => s + 1);
    else void handleSubmit();
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/join/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name:    firstName.trim(),
          last_name:     lastName.trim(),
          email:         email.trim().toLowerCase(),
          password,
          phone:         phone.trim() || undefined,
          custom_fields: Object.keys(customValues).length > 0 ? customValues : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed. Please try again."); return; }
      setSuccess(true);
    } catch {
      setError("Connection error. Please check your network and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    setSigninError("");
    if (!signinEmail.trim()) { setSigninError("Email is required."); return; }
    if (!signinPassword)     { setSigninError("Password is required."); return; }
    setSigninLoading(true);
    try {
      // No org slug → plain login, redirect to app
      if (!slug) {
        const res = await fetch("/api/auth/login", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ email: signinEmail.trim().toLowerCase(), password: signinPassword }),
        });
        const data = await res.json() as { token?: string; error?: string };
        if (!res.ok) { setSigninError(data.error ?? "Sign-in failed. Please check your credentials."); return; }
        window.location.href = "/app/";
        return;
      }

      const res  = await fetch(`/api/public/join/${slug}/link-account`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: signinEmail.trim().toLowerCase(), password: signinPassword }),
      });
      const data = await res.json() as {
        success?: boolean; error?: string;
        orgName?: string; primaryColor?: string; secondaryColor?: string;
        logoUrl?: string | null; alreadyMember?: boolean;
      };
      if (!res.ok) { setSigninError(data.error ?? "Sign-in failed. Please check your credentials."); return; }
      setLinkResult({
        orgName:       data.orgName       ?? org?.orgName ?? "",
        primaryColor:  data.primaryColor  ?? primary,
        secondaryColor:data.secondaryColor ?? secondary,
        logoUrl:       data.logoUrl       ?? null,
        alreadyMember: data.alreadyMember ?? false,
      });
    } catch {
      setSigninError("Connection error. Please check your network and try again.");
    } finally {
      setSigninLoading(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-slate-200 rounded-full" style={{ borderTopColor: primary, animation: "spin 0.8s linear infinite" }} />
          <p className="text-slate-500 text-sm">Loading registration page…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <Logo size={48} />
          <h1 className="text-2xl font-black text-slate-900 mt-6 mb-2">Page Not Found</h1>
          <p className="text-slate-500 text-sm mb-6">
            This registration link is invalid or the association no longer exists. Please contact your association for a new link.
          </p>
          <a href="/" className="text-[#1E3A8A] text-sm font-semibold hover:underline">← Back to Stride</a>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              {org?.logoUrl ? (
                <img src={org.logoUrl} alt={org.orgName} className="h-8 w-8 rounded-lg object-cover" />
              ) : <Logo size={32} />}
              <span className="font-bold text-slate-700 text-base">{org?.orgName}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${primary}15`, border: `2px solid ${primary}40` }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-2">You're In! 🎉</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              Your account has been created for{" "}
              <strong style={{ color: primary }}>{org?.orgName}</strong>.
              Download the Stride app and log in with your credentials to get started.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200 text-left">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your login credentials</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Email</span>
                  <span className="text-slate-800 font-semibold">{email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Password</span>
                  <span className="text-slate-800 font-semibold">••••••••</span>
                </div>
              </div>
            </div>

            {/* Emergency Alert Disclosure */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-start gap-2">
                <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">Emergency Notifications</p>
                  <p className="text-xs text-red-600 leading-relaxed">
                    Your account has <strong>emergency alerts enabled by default</strong>. These are urgent
                    safety broadcasts from your association (e.g. evacuation notices, SOS alerts). You can
                    manage this — along with lesson reminders — in the{" "}
                    <strong>Notification Preferences</strong> section of the Stride app after logging in.
                    Disabling emergency alerts requires double confirmation and is permanently logged.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Download the App</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <AppStoreBadge store="ios"     primary={primary} />
              <AppStoreBadge store="android" primary={primary} />
            </div>

            <p className="text-slate-400 text-xs mt-6">
              Already have the app?{" "}
              <span className="font-semibold" style={{ color: primary }}>Open it and log in.</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Link-account success screen ────────────────────────────────────────────

  if (linkResult) {
    const lp = linkResult.primaryColor;
    const ls = linkResult.secondaryColor;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              {linkResult.logoUrl ? (
                <img src={linkResult.logoUrl} alt={linkResult.orgName} className="h-8 w-8 rounded-lg object-cover" />
              ) : <Logo size={32} />}
              <span className="font-bold text-slate-700 text-base">{linkResult.orgName}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: `${lp}15`, border: `2px solid ${lp}40` }}>
              {linkResult.alreadyMember ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={lp} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={lp} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>

            {linkResult.alreadyMember ? (
              <>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Already a Member</h2>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">
                  Your account is already linked to{" "}
                  <strong style={{ color: lp }}>{linkResult.orgName}</strong>.
                  Open the Stride app and log in to continue.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Association Added! 🎉</h2>
                <p className="text-slate-500 text-sm leading-relaxed mb-6">
                  <strong style={{ color: lp }}>{linkResult.orgName}</strong> has been added to your
                  account. Open the Stride app, log in, and switch to the new association from
                  the <strong>Select Association</strong> screen.
                </p>
              </>
            )}

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Open the App</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <AppStoreBadge store="ios"     primary={ls} />
              <AppStoreBadge store="android" primary={ls} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Progress bar ───────────────────────────────────────────────────────────

  const stepLabels: string[] = hasCustomStep
    ? ["Account", "Details", "Legal", "Join"]
    : ["Account", "Legal", "Join"];

  const ProgressBar = () => (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        {Array.from({ length: currentMax }, (_, i) => i + 1).map(n => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 transition-colors`}
              style={{
                backgroundColor: n < step ? "#10B981" : n === step ? primary : "#F1F5F9",
                color: n <= step ? "#fff" : "#94A3B8",
                border: n > step ? "1px solid #E2E8F0" : "none",
              }}>
              {n < step ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : n}
            </div>
            {n < currentMax && (
              <div className="flex-1 h-0.5 rounded-full transition-colors"
                style={{ backgroundColor: n < step ? "#10B981" : "#E2E8F0" }} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-medium" style={{ color: "#94A3B8" }}>
        {stepLabels.map((label, i) => (
          <span key={label} style={{ color: step >= i + 1 ? primary : undefined, fontWeight: step === i + 1 ? "700" : undefined }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start px-4 py-10">

      {/* Branded header */}
      <div className="w-full max-w-md mb-6 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          {org?.logoUrl ? (
            <img src={org.logoUrl} alt={org.orgName} className="h-10 w-10 rounded-xl object-cover shadow-sm" />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: primary }}>
              <Logo size={24} />
            </div>
          )}
          <div className="text-left">
            <p className="text-xs text-slate-400 font-medium">Powered by</p>
            <p className="text-base font-black text-slate-800">{org?.orgName}</p>
          </div>
        </div>
        {cfg.welcomeMessage && (
          <p className="text-slate-500 text-sm leading-relaxed">{cfg.welcomeMessage}</p>
        )}
        {!cfg.welcomeMessage && (
          <p className="text-slate-500 text-sm">Create your member account to get started.</p>
        )}
      </div>

      {/* ── Mode toggle ── */}
      <div className="w-full max-w-md mb-4">
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => { setMode("register"); setSigninError(""); }}
            className="flex-1 py-3 text-sm font-bold transition-colors"
            style={mode === "register"
              ? { backgroundColor: primary, color: "#fff" }
              : { backgroundColor: "transparent", color: "#64748b" }}
          >
            New Member
          </button>
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(""); }}
            className="flex-1 py-3 text-sm font-bold transition-colors"
            style={mode === "signin"
              ? { backgroundColor: primary, color: "#fff" }
              : { backgroundColor: "transparent", color: "#64748b" }}
          >
            Already have an account?
          </button>
        </div>
      </div>

      {/* ── Sign-in card ── */}
      {mode === "signin" && (
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: primary }}>
            Sign In to Your Account
          </p>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Sign in with your existing Stride credentials to add{" "}
            <strong style={{ color: primary }}>{org?.orgName}</strong> to your account.
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
              <input
                type="email"
                className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 text-sm outline-none"
                placeholder="your@email.com"
                value={signinEmail}
                onChange={e => { setSigninEmail(e.target.value); setSigninError(""); }}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={signinShowPwd ? "text" : "password"}
                  className="w-full bg-white border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl px-4 py-3 pr-10 text-sm outline-none"
                  placeholder="Your password"
                  value={signinPassword}
                  onChange={e => { setSigninPassword(e.target.value); setSigninError(""); }}
                />
                <button
                  type="button"
                  onClick={() => setSigninShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {signinShowPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {signinError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm">{signinError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => { void handleSignIn(); }}
            disabled={signinLoading}
            className="w-full mt-6 font-black py-3.5 rounded-xl text-sm transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: secondary, color: "#0A192F" }}
          >
            {signinLoading ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Signing in…
              </>
            ) : "Sign In & Add Association"}
          </button>
        </div>
      )}

      {/* Form card */}
      {mode === "register" && <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-7 shadow-sm">
        <ProgressBar />

        {/* ── Step 1: Account ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: primary }}>Create Your Account</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>First Name *</label>
                <input type="text" className={`${inputCls} ${focusCls}`} placeholder="Jane"
                  value={firstName} onChange={e => { setFirstName(e.target.value); setError(""); }} autoFocus />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input type="text" className={`${inputCls} ${focusCls}`} placeholder="Smith"
                  value={lastName} onChange={e => { setLastName(e.target.value); setError(""); }} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email Address *</label>
              <input type="email" className={`${inputCls} ${focusCls}`} placeholder="jane@example.com"
                value={email} onChange={e => { setEmail(e.target.value); setError(""); }} />
            </div>
            {cfg.requirePhone && (
              <div>
                <label className={labelCls}>Phone Number *</label>
                <input type="tel" className={`${inputCls} ${focusCls}`} placeholder="+1 234 567 8900"
                  value={phone} onChange={e => { setPhone(e.target.value); setError(""); }} />
              </div>
            )}
            <div>
              <label className={labelCls}>Password *</label>
              <div className="relative">
                <input type={showPwd ? "text" : "password"} className={`${inputCls} ${focusCls} pr-10`}
                  placeholder="Min. 8 characters" value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Confirm Password *</label>
              <input type="password" className={`${inputCls} ${focusCls}`} placeholder="Repeat password"
                value={confirm} onChange={e => { setConfirm(e.target.value); setError(""); }} />
            </div>
          </div>
        )}

        {/* ── Step 2: Custom fields (if any) ───────────────────────── */}
        {customStep && step === customStep && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: primary }}>Additional Information</p>
            {cFields.map(f => (
              <div key={f.id}>
                <label className={labelCls}>{f.label}{f.required ? " *" : ""}</label>
                {f.description && <p className="text-xs text-slate-400 mb-1.5">{f.description}</p>}
                {f.type === "text" && (
                  <input type="text" className={`${inputCls} ${focusCls}`} placeholder={f.label}
                    value={(customValues[f.id] as string) ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [f.id]: e.target.value }))} />
                )}
                {f.type === "date" && (
                  <input type="date" className={`${inputCls} ${focusCls}`}
                    value={(customValues[f.id] as string) ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [f.id]: e.target.value }))} />
                )}
                {f.type === "checkbox" && (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={!!(customValues[f.id])}
                      onChange={e => setCustomValues(v => ({ ...v, [f.id]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 rounded"
                      style={{ accentColor: primary }} />
                    <span className="text-slate-600 text-sm">{f.label}</span>
                  </label>
                )}
                {f.type === "select" && f.options && (
                  <select className={`${inputCls} ${focusCls} appearance-none cursor-pointer`}
                    value={(customValues[f.id] as string) ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [f.id]: e.target.value }))}>
                    <option value="">Select…</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Legal step ────────────────────────────────────────────── */}
        {step === legalStep && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: primary }}>Legal Agreements</p>
            <p className="text-xs text-slate-500">Please read and accept the following agreements to complete your registration.</p>

            {/* Stride T&C */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
                onClick={() => setExpandedDoc(expandedDoc === "stride-tc" ? null : "stride-tc")}>
                <span className="text-sm font-semibold text-slate-800">Stride Terms of Service *</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${expandedDoc === "stride-tc" ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {expandedDoc === "stride-tc" && (
                <div className="px-4 py-3 border-t border-slate-200 bg-white max-h-40 overflow-y-auto">
                  <p className="text-xs text-slate-600 leading-relaxed">{STRIDE_TC_SUMMARY}</p>
                </div>
              )}
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer border-t border-slate-100">
                <input type="checkbox" checked={agreedStrideTc}
                  onChange={e => { setAgreedStrideTc(e.target.checked); setError(""); }}
                  className="w-4 h-4 flex-shrink-0" style={{ accentColor: primary }} />
                <span className="text-slate-600 text-xs">I have read and accept the Stride Terms of Service</span>
              </label>
            </div>

            {/* Stride Privacy */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
                onClick={() => setExpandedDoc(expandedDoc === "stride-privacy" ? null : "stride-privacy")}>
                <span className="text-sm font-semibold text-slate-800">Stride Privacy Policy *</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`transition-transform ${expandedDoc === "stride-privacy" ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {expandedDoc === "stride-privacy" && (
                <div className="px-4 py-3 border-t border-slate-200 bg-white max-h-40 overflow-y-auto">
                  <p className="text-xs text-slate-600 leading-relaxed">{STRIDE_PRIVACY_SUMMARY}</p>
                </div>
              )}
              <label className="flex items-center gap-3 px-4 py-3 cursor-pointer border-t border-slate-100">
                <input type="checkbox" checked={agreedStridePrivacy}
                  onChange={e => { setAgreedStridePrivacy(e.target.checked); setError(""); }}
                  className="w-4 h-4 flex-shrink-0" style={{ accentColor: primary }} />
                <span className="text-slate-600 text-xs">I have read and accept the Stride Privacy Policy</span>
              </label>
            </div>

            {/* Org-specific docs */}
            {cDocs.map(doc => (
              <div key={doc.id} className="border border-slate-200 rounded-xl overflow-hidden">
                <button type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
                  onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}>
                  <span className="text-sm font-semibold text-slate-800">
                    {doc.title}{doc.required ? " *" : ""}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    className={`transition-transform ${expandedDoc === doc.id ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {expandedDoc === doc.id && (
                  <div className="px-4 py-3 border-t border-slate-200 bg-white max-h-40 overflow-y-auto">
                    {doc.url ? (
                      <a href={doc.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold hover:underline" style={{ color: primary }}>
                        Open full document ↗
                      </a>
                    ) : (
                      <p className="text-xs text-slate-600 leading-relaxed">{doc.content ?? "See association for full document."}</p>
                    )}
                  </div>
                )}
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer border-t border-slate-100">
                  <input type="checkbox"
                    checked={!!agreedOrgDocs[doc.id]}
                    onChange={e => { setAgreedOrgDocs(v => ({ ...v, [doc.id]: e.target.checked })); setError(""); }}
                    className="w-4 h-4 flex-shrink-0" style={{ accentColor: primary }} />
                  <span className="text-slate-600 text-xs">I have read and accept: {doc.title}</span>
                </label>
              </div>
            ))}
          </div>
        )}

        {/* ── Last step: Review & Join ───────────────────────────────── */}
        {step === currentMax && step !== legalStep && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-bold uppercase tracking-wider mb-1" style={{ color: primary }}>Ready to Join</p>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
              {[
                { label: "Name",  value: [firstName, lastName].filter(Boolean).join(" ") },
                { label: "Email", value: email },
                ...(phone ? [{ label: "Phone", value: phone }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</span>
                  <span className="text-slate-700 font-semibold text-xs">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-500">Joining</p>
              <p className="text-sm font-bold" style={{ color: primary }}>{org?.orgName}</p>
              <p className="text-xs text-slate-400 mt-0.5">You will be registered as a Member.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className={`flex gap-3 mt-6 ${step > 1 ? "flex-row" : "flex-col"}`}>
          {step > 1 && (
            <button type="button" onClick={() => { setStep(s => s - 1); setError(""); }}
              className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl text-sm hover:bg-slate-50 transition-colors">
              Back
            </button>
          )}
          {step < currentMax ? (
            <button type="button" onClick={handleNext}
              className="flex-1 text-white font-bold py-3.5 rounded-xl text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: primary }}>
              Continue
            </button>
          ) : (
            <button type="button" onClick={handleNext} disabled={submitting}
              className="flex-1 font-black py-3.5 rounded-xl text-sm transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: secondary, color: "#0A192F" }}>
              {submitting ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Creating account…
                </>
              ) : "Complete Registration"}
            </button>
          )}
        </div>

      </div>}

      {/* Powered by */}
      <div className="mt-6 flex items-center gap-2 text-slate-400 text-xs">
        <Logo size={16} />
        <span>Powered by <strong className="text-slate-600">Stride Platform</strong></span>
      </div>
    </div>
  );
}
