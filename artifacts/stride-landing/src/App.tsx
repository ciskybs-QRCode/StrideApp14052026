import { useState } from "react";

export default function App() {
  const [formData, setFormData] = useState({ name: "", email: "", association: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#0A192F] text-white font-sans">

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-[#0A192F]/95 backdrop-blur border-b border-[#D4AF37]/20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-black tracking-tight text-white">
            <span className="text-[#D4AF37]">S</span>tride
          </span>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-300 hover:text-[#D4AF37] transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm text-slate-300 hover:text-[#D4AF37] transition-colors">How it Works</a>
            <a href="#contact" className="bg-[#D4AF37] text-[#0A192F] text-sm font-bold px-5 py-2 rounded-lg hover:bg-[#e8c44b] transition-colors">
              Contact Us
            </a>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden text-slate-300" onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-[#D4AF37]/20 bg-[#0A192F] px-6 py-4 flex flex-col gap-4">
            <a href="#features" className="text-sm text-slate-300" onClick={() => setMenuOpen(false)}>Features</a>
            <a href="#how-it-works" className="text-sm text-slate-300" onClick={() => setMenuOpen(false)}>How it Works</a>
            <a href="#contact" className="bg-[#D4AF37] text-[#0A192F] text-sm font-bold px-5 py-2 rounded-lg text-center" onClick={() => setMenuOpen(false)}>Contact Us</a>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-28 flex flex-col-reverse md:flex-row items-center gap-16">
        {/* Left: Text */}
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            <span className="text-[#D4AF37] text-xs font-semibold tracking-wider uppercase">Now Available</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight text-white mb-6">
            The Ultimate Management Platform for{" "}
            <span className="text-[#D4AF37]">Modern Associations.</span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed mb-10 max-w-xl mx-auto md:mx-0">
            Streamline your registrations, coordinate your staff, and give parents a premium mobile experience.
            All wrapped in one powerful, custom-branded ecosystem.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
            {/* App Store Badge */}
            <a href="#" className="flex items-center gap-3 bg-white text-[#0A192F] px-5 py-3.5 rounded-xl font-semibold hover:bg-slate-100 transition-colors shadow-lg">
              <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div>
                <div className="text-[10px] text-slate-500 leading-none">Download on the</div>
                <div className="text-base font-bold leading-tight">App Store</div>
              </div>
            </a>

            {/* Google Play Badge */}
            <a href="#" className="flex items-center gap-3 bg-white text-[#0A192F] px-5 py-3.5 rounded-xl font-semibold hover:bg-slate-100 transition-colors shadow-lg">
              <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.18 23.76c.3.17.64.26 1 .24l.13-.04L13.66 14 10 10.34 3.18 23.76zM20.74 10.76L18.1 9.28l-3.47 3.47 3.47 3.46 2.66-1.5a1.83 1.83 0 000-3.95zM2.25.86A1.85 1.85 0 002 1.7v20.6c0 .3.08.57.25.84L13.07 12 2.25.86zM13.66 10L4.31.27l-.13-.04a1.84 1.84 0 00-1 .24L13.66 10z"/>
              </svg>
              <div>
                <div className="text-[10px] text-slate-500 leading-none">Get it on</div>
                <div className="text-base font-bold leading-tight">Google Play</div>
              </div>
            </a>
          </div>
        </div>

        {/* Right: Phone Mockup */}
        <div className="flex-shrink-0 relative">
          <div className="relative w-[220px] h-[440px] mx-auto">
            {/* Glow */}
            <div className="absolute inset-0 bg-[#D4AF37]/20 rounded-[3rem] blur-3xl scale-110" />
            {/* Phone shell */}
            <div className="relative w-full h-full bg-[#112240] border-4 border-[#D4AF37]/40 rounded-[3rem] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)] flex flex-col items-center">
              {/* Notch */}
              <div className="w-24 h-6 bg-[#0A192F] rounded-b-2xl mt-0 flex-shrink-0" />
              {/* Screen content */}
              <div className="flex-1 w-full px-4 py-4 flex flex-col gap-3">
                <div className="bg-[#D4AF37] rounded-2xl h-10 flex items-center justify-center">
                  <div className="w-20 h-3 bg-[#0A192F]/40 rounded-full" />
                </div>
                {[80, 60, 90, 50, 70].map((w, i) => (
                  <div key={i} className="bg-[#1e3a6e]/60 rounded-xl p-3 flex gap-2 items-center">
                    <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/20 flex-shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <div className={`h-2 bg-slate-500/50 rounded-full`} style={{ width: `${w}%` }} />
                      <div className="h-1.5 bg-slate-600/40 rounded-full w-3/5" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Home indicator */}
              <div className="w-20 h-1 bg-[#D4AF37]/40 rounded-full mb-3" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div className="bg-[#D4AF37]/5 border-y border-[#D4AF37]/15">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { n: "500+", label: "Associations" },
            { n: "12k+", label: "Active Members" },
            { n: "99.9%", label: "Uptime" },
            { n: "4.9★", label: "App Rating" },
          ].map(({ n, label }) => (
            <div key={label}>
              <div className="text-3xl font-black text-[#D4AF37]">{n}</div>
              <div className="text-sm text-slate-400 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it Works ── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">Simple Onboarding</div>
          <h2 className="text-3xl md:text-4xl font-black text-white">Getting Started is Simple</h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            Switch from messy spreadsheets to automated mobile tracking in just three steps.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Register Online",
              desc: "Click your association's unique invite link to create your parent or member profile securely on our web portal using any desktop or mobile device.",
              icon: (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              ),
            },
            {
              step: "02",
              title: "Download Stride",
              desc: "Grab the official Stride application from the Apple App Store or Google Play Store and log in instantly using your verified credentials.",
              icon: (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              ),
            },
            {
              step: "03",
              title: "Scan & Go",
              desc: "Access your digital QR code, sign your registration paperwork digitally, add dependent family members, and manage your private lesson bookings on the fly.",
              icon: (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                </svg>
              ),
            },
          ].map(({ step, title, desc, icon }) => (
            <div key={step} className="relative group bg-[#112240] border border-[#D4AF37]/20 rounded-2xl p-8 hover:border-[#D4AF37]/50 transition-colors">
              <div className="absolute top-6 right-6 text-5xl font-black text-[#D4AF37]/8 select-none">{step}</div>
              <div className="w-14 h-14 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-2xl flex items-center justify-center text-[#D4AF37] mb-6">
                {icon}
              </div>
              <h3 className="text-lg font-bold text-white mb-3">{step}. {title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="bg-[#0d1f3c] border-y border-[#D4AF37]/10">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">Why Stride</div>
            <h2 className="text-3xl md:text-4xl font-black text-white">Built for Operators.<br />Loved by Parents.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: "Dynamic Profile Switching",
                desc: "Admins, operators, and parents share the exact same mobile interface layout. Seamlessly switch roles with a single tap to view data, track attendance, or manage schedules without continuous logging out.",
                icon: "🔄",
              },
              {
                title: "Granular Privacy & Safety First",
                desc: "Take total control of your data compliance. Set individual, independent photo and video consent rules for each dependent member right inside the profile setup.",
                icon: "🔒",
              },
              {
                title: "Automated Financial Workflows",
                desc: "Manage course packages, book private lessons with native map routing updates, and issue structured operator invoice reports with custom payment threshold rules.",
                icon: "💳",
              },
              {
                title: "Double-Tap Emergency Alerts",
                desc: "Safety is our core priority. Both admins and operators have immediate access to a secure, double-tap emergency broadcast trigger to handle critical situations instantly without false alarms.",
                icon: "🚨",
              },
            ].map(({ title, desc, icon }) => (
              <div key={title} className="bg-[#112240] border border-[#D4AF37]/20 rounded-2xl p-8 flex gap-5 hover:border-[#D4AF37]/40 transition-colors">
                <div className="text-3xl flex-shrink-0 mt-1">{icon}</div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[#D4AF37] text-sm font-semibold uppercase tracking-widest mb-3">Get In Touch</div>
            <h2 className="text-3xl md:text-4xl font-black text-white">Ready to Elevate Your Association?</h2>
            <p className="mt-4 text-slate-400">Tell us about your association and we'll set you up with a customised demo.</p>
          </div>

          {submitted ? (
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-white mb-2">Request Received!</h3>
              <p className="text-slate-400">Our team will be in touch within 24 hours.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-[#112240] border border-[#D4AF37]/20 rounded-2xl p-8 flex flex-col gap-5">
              {[
                { id: "name", label: "Your Name", placeholder: "Jane Smith", type: "text" },
                { id: "email", label: "Email Address", placeholder: "jane@example.com", type: "email" },
                { id: "association", label: "Association Name", placeholder: "Riverside Dance Academy", type: "text" },
              ].map(({ id, label, placeholder, type }) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-sm font-semibold text-slate-300 mb-2">{label}</label>
                  <input
                    id={id}
                    type={type}
                    placeholder={placeholder}
                    required
                    value={formData[id as keyof typeof formData]}
                    onChange={e => setFormData(p => ({ ...p, [id]: e.target.value }))}
                    className="w-full bg-[#0A192F] border border-[#D4AF37]/40 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors"
                  />
                </div>
              ))}

              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-slate-300 mb-2">Message</label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Tell us about your association and what you're looking for…"
                  required
                  value={formData.message}
                  onChange={e => setFormData(p => ({ ...p, message: e.target.value }))}
                  className="w-full bg-[#0A192F] border border-[#D4AF37]/40 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#D4AF37] transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#D4AF37] text-[#0A192F] font-bold py-4 rounded-xl text-sm uppercase tracking-wider hover:bg-[#e8c44b] transition-colors"
              >
                Submit Request
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#D4AF37]/15 bg-[#060f1e]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span className="font-black text-lg text-white"><span className="text-[#D4AF37]">S</span>tride</span>
          <span>© {new Date().getFullYear()} Stride. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-[#D4AF37] transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-[#D4AF37] transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
