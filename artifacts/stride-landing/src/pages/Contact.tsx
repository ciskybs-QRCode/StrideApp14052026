import { useState, useEffect } from "react";
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

const ROLES = [
  "Association Director",
  "Operator / Coach",
  "Association Manager",
  "Parent / Guardian",
  "Administrator",
  "Other",
];

interface Review {
  id: number;
  name: string;
  role: string;
  association_name: string;
  member_count: number | null;
  rating: number;
  comment: string;
  created_at: string;
}

function Stars({ rating, interactive = false, onSelect }: { rating: number; interactive?: boolean; onSelect?: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onSelect?.(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? "cursor-pointer focus:outline-none" : "cursor-default"}
          aria-label={interactive ? `Rate ${n} star${n > 1 ? "s" : ""}` : undefined}
        >
          <svg width={interactive ? 28 : 18} height={interactive ? 28 : 18} viewBox="0 0 24 24" fill={(hover || rating) >= n ? "#FBBF24" : "none"} stroke={(hover || rating) >= n ? "#FBBF24" : "#CBD5E1"} strokeWidth="1.8">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function Contact() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [topic,   setTopic]   = useState(topics[0]);
  const [message, setMessage] = useState("");
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  const [reviews,      setReviews]      = useState<Review[]>([]);
  const [revName,      setRevName]      = useState("");
  const [revRole,      setRevRole]      = useState(ROLES[0]);
  const [revOrg,       setRevOrg]       = useState("");
  const [revCount,     setRevCount]     = useState("");
  const [revRating,    setRevRating]    = useState(0);
  const [revComment,   setRevComment]   = useState("");
  const [revSent,      setRevSent]      = useState(false);
  const [revError,     setRevError]     = useState("");
  const [revSubmitting, setRevSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/reviews")
      .then(r => r.json())
      .then((data: Review[]) => setReviews(data))
      .catch(() => setReviews([]));
  }, [revSent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in all required fields."); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address."); return;
    }
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), topic, message: message.trim() }),
      });
      if (res.ok) { setSent(true); return; }
    } catch { /* fall through */ }
    const subject = encodeURIComponent(`[Stride] ${topic} — ${name}`);
    const body    = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`);
    window.open(`mailto:info@stride-ops.com?subject=${subject}&body=${body}`, "_blank");
    setSent(true);
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevError("");
    if (!revName.trim()) { setRevError("Please enter your name."); return; }
    if (!revOrg.trim())  { setRevError("Please enter your association name."); return; }
    if (revRating === 0) { setRevError("Please select a star rating."); return; }
    if (revComment.trim().length < 20) { setRevError("Review must be at least 20 characters."); return; }
    setRevSubmitting(true);
    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: revName.trim(),
          role: revRole,
          association_name: revOrg.trim(),
          member_count: revCount ? Number(revCount) : null,
          rating: revRating,
          comment: revComment.trim(),
        }),
      });
      if (res.ok) {
        setRevSent(true);
      } else {
        const d = await res.json() as { error?: string };
        setRevError(d.error ?? "Failed to submit. Please try again.");
      }
    } catch {
      setRevError("Network error. Please try again.");
    } finally {
      setRevSubmitting(false);
    }
  };

  const inputCls  = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/25 focus:border-[#1E3A8A] transition";
  const selectCls = `${inputCls} appearance-none cursor-pointer`;

  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-20">

          {/* ── Contact info panel ── */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Email direct */}
            <div className="bg-[#1E3A8A] rounded-2xl p-6 text-white">
              <div className="w-10 h-10 rounded-xl bg-[#FBBF24]/20 flex items-center justify-center mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h3 className="font-black text-lg mb-1">Email us directly</h3>
              <a href="mailto:info@stride-ops.com" className="text-[#FBBF24] font-bold text-base hover:underline">
                info@stride-ops.com
              </a>
              <div className="mt-4 space-y-2 text-sm text-blue-200 border-t border-white/10 pt-4">
                <div className="flex justify-between"><span>General enquiries</span><span className="text-white font-semibold">24–48 h</span></div>
                <div className="flex justify-between"><span>Technical support</span><span className="text-white font-semibold">4–8 h</span></div>
                <div className="flex justify-between"><span>Billing issues</span><span className="text-white font-semibold">2–4 h</span></div>
                <div className="flex justify-between"><span>Critical / urgent</span><span className="text-[#FBBF24] font-bold">ASAP</span></div>
              </div>
            </div>

            {/* Contact methods */}
            <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-6 space-y-5">
              <h3 className="font-black text-slate-800 text-base">Direct Contact</h3>
              {[
                { icon: "✉️", label: "General support",   value: "info@stride-ops.com", href: "mailto:info@stride-ops.com" },
                { icon: "⚖️", label: "Legal & privacy",   value: "info@stride-ops.com", href: "mailto:info@stride-ops.com" },
                { icon: "💳", label: "Billing enquiries", value: "info@stride-ops.com", href: "mailto:info@stride-ops.com?subject=Billing%20Enquiry" },
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
            <a href="/faq" className="flex items-center justify-between p-4 bg-[#FBBF24]/10 border border-[#FBBF24]/25 rounded-xl no-underline hover:bg-[#FBBF24]/15 transition-colors group">
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
                    We'll get back to you at <strong>{email}</strong> as soon as possible.
                  </p>
                  <button onClick={() => { setSent(false); setName(""); setEmail(""); setMessage(""); }}
                    className="mt-6 text-sm text-[#1E3A8A] hover:underline font-semibold">
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
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" className={inputCls} placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address <span className="text-red-500">*</span></label>
                    <input type="email" className={inputCls} placeholder="jane@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Topic</label>
                  <div className="relative">
                    <select className={selectCls} value={topic} onChange={e => setTopic(e.target.value)}>
                      {topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Message <span className="text-red-500">*</span></label>
                  <textarea className={`${inputCls} resize-none`} rows={6}
                    placeholder="Describe your question or issue in as much detail as possible…"
                    value={message} onChange={e => setMessage(e.target.value)} />
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <button type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-[#1E3A8A] text-white font-bold text-base py-3.5 rounded-xl hover:bg-[#1e3070] transition-colors">
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

        {/* ══════════════════════════════════════════════════════
            REVIEWS SECTION
        ══════════════════════════════════════════════════════ */}
        <div className="border-t border-slate-200 pt-16">

          {/* Section header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-[#FBBF24]/15 border border-[#FBBF24]/30 rounded-full px-4 py-1.5 mb-5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1.5">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span className="text-[#92660A] text-xs font-bold uppercase tracking-wider">Customer Reviews</span>
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">What our customers say</h2>
            {reviews.length > 0 && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <Stars rating={Math.round(avgRating)} />
                <span className="text-slate-700 font-bold text-lg">{avgRating.toFixed(1)}</span>
                <span className="text-slate-400 text-sm">({reviews.length} review{reviews.length !== 1 ? "s" : ""})</span>
              </div>
            )}
            {reviews.length === 0 && (
              <p className="text-slate-400 text-sm mt-2">Be the first to leave a review!</p>
            )}
          </div>

          {/* Reviews grid */}
          {reviews.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-12">
              {reviews.map(r => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-3">
                  <Stars rating={r.rating} />
                  <p className="text-slate-700 text-sm leading-relaxed flex-1">"{r.comment}"</p>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-slate-900 font-bold text-sm">{r.name}</p>
                    <p className="text-slate-400 text-xs">{r.role} · {r.association_name}{r.member_count ? ` · ${r.member_count} members` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Leave a review form */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-white border-2 border-[#1E3A8A]/12 rounded-2xl p-8 shadow-sm">
              {revSent ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">Thank you for your review!</h3>
                  <p className="text-slate-500 text-sm">Your feedback will appear once approved by our team.</p>
                  <button onClick={() => { setRevSent(false); setRevName(""); setRevOrg(""); setRevRating(0); setRevComment(""); setRevCount(""); }}
                    className="mt-5 text-sm text-[#1E3A8A] hover:underline font-semibold">
                    Leave another review
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReview} className="space-y-5">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 mb-1">Leave a Review</h3>
                    <p className="text-slate-500 text-sm">Share your experience with Stride to help other associations.</p>
                  </div>

                  {/* Star rating */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Rating <span className="text-red-500">*</span></label>
                    <Stars rating={revRating} interactive onSelect={setRevRating} />
                    {revRating > 0 && (
                      <p className="text-slate-400 text-xs mt-1.5">
                        {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][revRating]}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Name <span className="text-red-500">*</span></label>
                      <input type="text" className={inputCls} placeholder="Jane Smith" value={revName} onChange={e => setRevName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Role <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <select className={selectCls} value={revRole} onChange={e => setRevRole(e.target.value)}>
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Association Name <span className="text-red-500">*</span></label>
                      <input type="text" className={inputCls} placeholder="Bella Dance Academy" value={revOrg} onChange={e => setRevOrg(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Number of Members <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
                      <input type="number" className={inputCls} placeholder="e.g. 120" min={1} value={revCount} onChange={e => setRevCount(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Review <span className="text-red-500">*</span></label>
                    <textarea className={`${inputCls} resize-none`} rows={5}
                      placeholder="Tell us about your experience with Stride — what do you love, and how has it helped your association?"
                      value={revComment} onChange={e => setRevComment(e.target.value)} />
                    <p className="text-slate-400 text-xs mt-1">{revComment.trim().length}/20 characters minimum</p>
                  </div>

                  {revError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p className="text-red-600 text-sm">{revError}</p>
                    </div>
                  )}

                  <button type="submit" disabled={revSubmitting}
                    className="w-full flex items-center justify-center gap-2 bg-[#FBBF24] text-[#0A192F] font-bold text-base py-3.5 rounded-xl hover:bg-[#fcd34d] transition-colors disabled:opacity-60">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {revSubmitting ? "Submitting…" : "Submit Review"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

      </div>
    </PageShell>
  );
}
