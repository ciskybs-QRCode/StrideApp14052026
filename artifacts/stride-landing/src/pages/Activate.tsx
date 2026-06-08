import { useState, useEffect } from "react";
import { PageShell } from "../components/PageShell";

type Status = "loading" | "success" | "already" | "error";

const IcoMail = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IcoShieldCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const IcoInfo = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IcoXCircle = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const IcoLoader = () => (
  <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
    <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
  </svg>
);

export default function Activate() {
  const token  = new URLSearchParams(window.location.search).get("token") ?? "";

  const [status,  setStatus]  = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("This activation link is invalid or missing a token. Please check the email you received.");
      return;
    }
    fetch(`/api/auth/activate/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.activated) {
          setStatus(d.alreadyDone ? "already" : "success");
          setMessage(d.message ?? "Your account is now active.");
        } else {
          setStatus("error");
          setMessage(d.error ?? "Activation failed. The link may have expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Connection error. Please check your network and try again.");
      });
  }, [token]);

  const states: Record<Status, {
    Icon:    React.ComponentType;
    iconBg:  string;
    iconBorder: string;
    badge:   string;
    badgeBg: string;
    badgeBorder: string;
    title:   string;
    sub?:    string;
    ctas:    { label: string; href: string; primary: boolean }[];
  }> = {
    loading: {
      Icon: IcoLoader,
      iconBg: "bg-[#D4AF37]/10", iconBorder: "border-[#D4AF37]/25",
      badge: "Verifying…", badgeBg: "bg-[#D4AF37]/10", badgeBorder: "border-[#D4AF37]/25",
      title: "Verifying Your Account",
      sub:   "This will only take a moment. Please don't close this page.",
      ctas: [],
    },
    success: {
      Icon: IcoShieldCheck,
      iconBg: "bg-emerald-500/10", iconBorder: "border-emerald-500/30",
      badge: "Account Activated", badgeBg: "bg-emerald-500/10", badgeBorder: "border-emerald-500/30",
      title: "You're In!",
      sub:   "Your account is confirmed. Download the Stride app and log in to get started.",
      ctas: [
        { label: "Download on App Store",  href: "https://apps.apple.com",    primary: true },
        { label: "Get on Google Play",     href: "https://play.google.com",   primary: false },
      ],
    },
    already: {
      Icon: IcoInfo,
      iconBg: "bg-blue-500/10", iconBorder: "border-blue-500/30",
      badge: "Already Activated", badgeBg: "bg-blue-500/10", badgeBorder: "border-blue-500/30",
      title: "Already Active",
      sub:   "This account was activated previously. Open the Stride app to log in.",
      ctas: [
        { label: "Back to Home", href: "/", primary: true },
      ],
    },
    error: {
      Icon: IcoXCircle,
      iconBg: "bg-red-500/10", iconBorder: "border-red-500/30",
      badge: "Activation Failed", badgeBg: "bg-red-500/10", badgeBorder: "border-red-500/30",
      title: "Something Went Wrong",
      sub:   undefined,
      ctas: [
        { label: "Contact Support", href: "/contact", primary: true },
        { label: "Back to Home",    href: "/",        primary: false },
      ],
    },
  };

  const s = states[status];

  return (
    <PageShell dark>
      <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">

          <div className="bg-white/4 border border-white/10 rounded-2xl p-10">

            {/* Icon */}
            <div className={`w-16 h-16 rounded-full ${s.iconBg} border-2 ${s.iconBorder} flex items-center justify-center mx-auto mb-5`}>
              <s.Icon />
            </div>

            {/* Status badge */}
            <div className={`inline-flex items-center gap-2 ${s.badgeBg} border ${s.badgeBorder} rounded-full px-4 py-1.5 mb-5`}>
              {status === "loading" && <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />}
              {status === "success" && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              <span className="text-white text-xs font-bold tracking-wider uppercase">{s.badge}</span>
            </div>

            <h1 className="text-2xl font-black text-white mb-3">{s.title}</h1>

            {s.sub && (
              <p className="text-blue-200 text-sm leading-relaxed mb-4">{s.sub}</p>
            )}

            {status === "error" && message && (
              <p className="text-red-300 text-sm leading-relaxed mb-4">{message}</p>
            )}

            {status === "success" && (
              <div className="bg-[#D4AF37]/8 border border-[#D4AF37]/20 rounded-xl p-4 mb-6 text-left">
                <p className="text-[#D4AF37] text-xs font-bold uppercase tracking-wider mb-2">Next Steps</p>
                {[
                  "Download the Stride app on your device",
                  "Log in with your email and password",
                  "Complete your profile and explore your dashboard",
                ].map((step, i) => (
                  <div key={step} className="flex items-center gap-2.5 mb-2 last:mb-0">
                    <span className="w-5 h-5 rounded-full bg-[#D4AF37] text-[#0A192F] text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span className="text-blue-200 text-sm">{step}</span>
                  </div>
                ))}
              </div>
            )}

            {/* CTAs */}
            {s.ctas.length > 0 && (
              <div className="flex flex-col gap-3">
                {s.ctas.map(({ label, href, primary }) => (
                  <a key={label} href={href}
                    className={`block font-bold py-3.5 rounded-xl text-sm transition-colors no-underline
                      ${primary
                        ? "bg-[#D4AF37] text-[#0A192F] hover:bg-[#e8c44b]"
                        : "bg-white/6 border border-white/15 text-blue-200 hover:bg-white/10"
                      }`}>
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <p className="text-blue-500 text-xs mt-6">
            Need help?{" "}
            <a href="/contact" className="text-blue-300 hover:text-white transition-colors underline">
              Contact our support team
            </a>
          </p>

        </div>
      </div>
    </PageShell>
  );
}
