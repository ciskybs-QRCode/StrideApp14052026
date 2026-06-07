import { useState } from "react";
import { PageShell } from "../components/PageShell";

const topics = [
  "General enquiry",
  "Technical support",
  "Billing & subscriptions",
  "Account activation",
  "Data / privacy request",
  "Partnership enquiry",
  "Other",
];

export default function Contact() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [topic,   setTopic]   = useState(topics[0]);
  const [message, setMessage] = useState("");
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in all required fields."); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address."); return;
    }
    // Open mailto as a fallback (replace with API call when backend contact endpoint exists)
    const subject = encodeURIComponent(`[Stride] ${topic} — ${name}`);
    const body    = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`);
    window.location.href = `mailto:support@stride.app?subject=${subject}&body=${body}`;
    setSent(true);
  };

  const inputCls  = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/25 focus:border-[#1E3A8A] transition";
  const selectCls = `${inputCls} appearance-none cursor-pointer`;

  return (
    <PageShell>
      <div className="max-w-5xl mx-auto px-5 py-14">

        {/* Page header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#1E3A8A]/8 border border-[#1E3A8A]/15 rounded-full px-4 py-1.5 mb-5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <span className="text-[#1E3A8A] text-xs font-bold uppercase tracking-wider">Get in Touch</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-3">Contact &amp; Support</h1>
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            Our team is here to help. Reach out with any questions about the platform, your subscription, or your data.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* ── Contact info panel ── */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Response time */}
            <div className="bg-[#1E3A8A] rounded-2xl p-6 text-white">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="font-black text-lg mb-2">Response Times</h3>
              <div className="space-y-2 text-sm text-blue-200">
                <div className="flex justify-between"><span>General enquiries</span><span className="text-white font-semibold">24–48 hours</span></div>
                <div className="flex justify-between"><span>Technical support</span><span className="text-white font-semibold">4–8 hours</span></div>
                <div className="flex justify-between"><span>Billing issues</span><span className="text-white font-semibold">2–4 hours</span></div>
                <div className="flex justify-between"><span>Critical / urgent</span><span className="text-[#D4AF37] font-bold">ASAP</span></div>
              </div>
            </div>

            {/* Contact methods */}
            <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-6 space-y-5">
              <h3 className="font-black text-slate-800 text-base">Direct Contact</h3>
              {[
                {
                  icon: "✉️",
                  label: "General support",
                  value: "support@stride.app",
                  href: "mailto:support@stride.app",
                },
                {
                  icon: "⚖️",
                  label: "Legal & privacy",
                  value: "legal@stride.app",
                  href: "mailto:legal@stride.app",
                },
                {
                  icon: "💳",
                  label: "Billing enquiries",
                  value: "billing@stride.app",
                  href: "mailto:billing@stride.app?subject=Billing%20Enquiry",
                },
              ].map(item => (
                <a key={item.label} href={item.href} className="flex items-start gap-3 group no-underline">
                  <div className="w-9 h-9 rounded-xl bg-[#1E3A8A]/8 flex items-center justify-center flex-shrink-0 text-base">{item.icon}</div>
                  <div>
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{item.label}</p>
                    <p className="text-[#1E3A8A] text-sm font-bold group-hover:underline">{item.value}</p>
                  </div>
                </a>
              ))}
            </div>

            {/* FAQ link */}
            <a href="/#faq" className="flex items-center justify-between p-4 bg-[#D4AF37]/10 border border-[#D4AF37]/25 rounded-xl no-underline hover:bg-[#D4AF37]/15 transition-colors group">
              <div>
                <p className="text-[#92660A] font-bold text-sm">Check our FAQ first</p>
                <p className="text-[#92660A]/70 text-xs mt-0.5">Many common questions are answered there</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92660A" strokeWidth="2.5" className="flex-shrink-0">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>

          {/* ── Contact form ── */}
          <div className="lg:col-span-3">
            {sent ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center p-10">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 mb-2">Message sent!</h2>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Your default email client has opened with your message pre-filled. Hit send to complete your enquiry — we'll get back to you shortly.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-6 text-sm text-[#1E3A8A] hover:underline font-semibold"
                  >
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-7 shadow-sm space-y-5">
                <h2 className="text-xl font-black text-slate-900 mb-1">Send us a message</h2>
                <p className="text-slate-500 text-sm">All fields marked <span className="text-red-500">*</span> are required.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="Jane Smith"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      className={inputCls}
                      placeholder="jane@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Topic</label>
                  <div className="relative">
                    <select
                      className={selectCls}
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                    >
                      {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={6}
                    placeholder="Describe your question or issue in as much detail as possible…"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-[#1E3A8A] text-white font-bold text-base py-3.5 rounded-xl hover:bg-[#1e3070] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Send Message
                </button>

                <p className="text-slate-400 text-xs text-center">
                  By submitting this form you agree to our{" "}
                  <a href="/privacy" className="text-[#1E3A8A] hover:underline">Privacy Policy</a>.
                </p>
              </form>
            )}
          </div>
        </div>

      </div>
    </PageShell>
  );
}
