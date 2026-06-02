import { useState, useEffect } from "react";

export default function Activate() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Invalid activation link."); return; }
    fetch(`/api/auth/activate/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.activated) {
          setStatus(d.alreadyDone ? "already" : "success");
          setMessage(d.message ?? "Account activated!");
        } else {
          setStatus("error");
          setMessage(d.error ?? "Activation failed.");
        }
      })
      .catch(() => { setStatus("error"); setMessage("Connection error."); });
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0A192F] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="bg-[#112240] border border-[#D4AF37]/20 rounded-2xl p-10">
          {status === "loading" && (
            <>
              <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
                <span className="text-3xl">⏳</span>
              </div>
              <h2 className="text-xl font-black text-white mb-2">Verifying your account…</h2>
              <p className="text-slate-400 text-sm">This will just take a moment.</p>
            </>
          )}
          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="text-xl font-black text-white mb-2">Account Activated!</h2>
              <p className="text-slate-400 text-sm mb-6">{message}</p>
              <div className="flex flex-col gap-3">
                <a href="https://apps.apple.com" className="block bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors">
                  Download on App Store
                </a>
                <a href="https://play.google.com" className="block bg-[#112240] border border-[#D4AF37]/30 text-[#D4AF37] font-bold py-3.5 rounded-xl text-sm hover:border-[#D4AF37]/60 transition-colors">
                  Get on Google Play
                </a>
              </div>
            </>
          )}
          {status === "already" && (
            <>
              <div className="w-16 h-16 rounded-full bg-blue-500/10 border-2 border-blue-500/30 flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">ℹ️</span>
              </div>
              <h2 className="text-xl font-black text-white mb-2">Already Activated</h2>
              <p className="text-slate-400 text-sm mb-6">{message}</p>
              <a href="/" className="block bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors">
                Back to Home
              </a>
            </>
          )}
          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">❌</span>
              </div>
              <h2 className="text-xl font-black text-white mb-2">Activation Failed</h2>
              <p className="text-slate-400 text-sm mb-6">{message}</p>
              <a href="/" className="block bg-[#D4AF37] text-[#0A192F] font-bold py-3.5 rounded-xl text-sm hover:bg-[#e8c44b] transition-colors">
                Back to Home
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
