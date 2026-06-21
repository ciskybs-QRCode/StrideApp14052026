import React from "react";
import { ScaleToFit } from "./ScaleToFit";
import { useCurrency, getPrice } from "../../lib/useCurrency";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const WHITE = "#FFFFFF";
const BG = "#F8FAFF";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');`;

const FEATURES = [
  { icon: "📷", title: "QR Attendance", desc: "Instant check-in for every member with a simple QR scan. No paper, no friction.", color: "#FBBF24" },
  { icon: "📍", title: "Smart Pick-Up", desc: "BLE proximity and parent authorisation ensure every child leaves with the right person.", color: "#60A5FA" },
  { icon: "🚨", title: "Emergency Pulse", desc: "Broadcast critical alerts to all families in seconds. Full acknowledgment tracking.", color: "#F87171" },
  { icon: "💳", title: "Online Payments", desc: "Membership fees, event tickets, and marketplace items — all handled via Stripe.", color: "#4ADE80" },
  { icon: "📊", title: "Live Analytics", desc: "Revenue, attendance trends, course occupancy — every metric your director needs.", color: "#A78BFA" },
  { icon: "📋", title: "Digital Contracts", desc: "ToS, media releases, GDPR consent — signed digitally with SHA-256 audit trail.", color: "#FB923C" },
];

export default function Brochure() {
  const curr = useCurrency();

  const PLANS = [
    { name: "Core",    price: getPrice("core",    curr.code), features: ["Up to 100 members", "QR Attendance", "Smart Pick-Up", "Online Payments", "SOS Emergency"],                              highlight: false },
    { name: "Plus",    price: getPrice("plus",    curr.code), features: ["Up to 300 members", "Everything in Core", "AI Roster Optimizer", "Marketplace", "Multi-association"],                   highlight: true  },
    { name: "Premium", price: getPrice("premium", curr.code), features: ["Unlimited members", "Everything in Plus", "White-label branding", "Dedicated support", "Custom integrations"],           highlight: false },
  ];

  const CONTENT = (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: 1200, background: WHITE, color: "#0F172A" }}>
      <style>{montserrat}</style>

      {/* HERO */}
      <div style={{ background: NAVY, padding: "80px 100px 100px", position: "relative", overflow: "hidden", minHeight: 600 }}>
        <div style={{ position: "absolute", top: -150, right: -150, width: 600, height: 600, borderRadius: "50%", border: "1px solid rgba(251,191,36,0.12)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 400, height: 400, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: GOLD }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 70 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: NAVY }}>S</span>
          </div>
          <span style={{ fontSize: 26, fontWeight: 800, color: WHITE, letterSpacing: 1 }}>STRIDE</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, letterSpacing: 3, marginBottom: 24 }}>ASSOCIATION MANAGEMENT PLATFORM</div>
        <div style={{ fontSize: 72, fontWeight: 900, color: WHITE, lineHeight: 1.05, letterSpacing: -2, marginBottom: 32, maxWidth: 800 }}>
          The platform your association deserves.
        </div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.65)", fontWeight: 400, lineHeight: 1.6, maxWidth: 680, marginBottom: 56 }}>
          Stride brings together attendance, payments, communications, analytics, and compliance — in a single app built specifically for sports and cultural associations.
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ background: GOLD, borderRadius: 40, padding: "16px 40px" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Start Free Trial</span>
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,0.25)", borderRadius: 40, padding: "16px 40px" }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: WHITE }}>stride.app</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 60 }}>
          {["👨‍👩‍👧 For Families", "🎓 For Instructors", "⚙️ For Directors"].map(b => (
            <div key={b} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 30, padding: "10px 24px" }}>
              <span style={{ fontSize: 16, color: WHITE, fontWeight: 600 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* THE PROBLEM */}
      <div style={{ padding: "80px 100px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: 2, marginBottom: 20 }}>THE PROBLEM</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: NAVY, letterSpacing: -1, marginBottom: 32, lineHeight: 1.1 }}>Managing an association is still painfully manual.</div>
        <div style={{ display: "flex", gap: 24 }}>
          {[
            { emoji: "📱", label: "WhatsApp chaos", desc: "Families texting at all hours. No record, no accountability." },
            { emoji: "📊", label: "Excel hell", desc: "Attendance sheets, payment tracking, scheduling — in three different spreadsheets." },
            { emoji: "📄", label: "Paper everything", desc: "Consent forms, medical certs, contracts — lost in a folder." },
            { emoji: "🤷", label: "No visibility", desc: "No idea which courses are full, who hasn't paid, or what's trending." },
          ].map(p => (
            <div key={p.label} style={{ flex: 1, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "28px 24px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>{p.emoji}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: NAVY }}>{p.label}</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <div style={{ padding: "80px 100px", background: WHITE }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: 2, marginBottom: 20 }}>FEATURES</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: NAVY, letterSpacing: -1, marginBottom: 48, lineHeight: 1.1 }}>Everything your association needs.<br />Nothing it doesn't.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "32px 28px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: `${f.color}20`, border: `1px solid ${f.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 20 }}>{f.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, color: NAVY }}>{f.title}</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* THREE VIEWS */}
      <div style={{ padding: "80px 100px", background: NAVY }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 20 }}>THREE VIEWS. ONE PLATFORM.</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: WHITE, letterSpacing: -1, marginBottom: 48, lineHeight: 1.1 }}>Built for every person<br />in your association.</div>
        <div style={{ display: "flex", gap: 24 }}>
          {[
            { role: "Families",    icon: "👨‍👩‍👧", color: GOLD,      items: ["Live attendance updates", "Smart Pick-Up alerts", "Event tickets & booking", "Wallet & payments", "Digital document signing"] },
            { role: "Instructors", icon: "🎓",     color: "#60A5FA", items: ["QR attendance scanner", "Daily roll call roster", "Substitute management", "Payroll & schedules", "Emergency SOS button"] },
            { role: "Directors",   icon: "⚙️",     color: "#4ADE80", items: ["Revenue dashboard", "Member management", "Course analytics", "White-label branding", "Legal compliance"] },
          ].map(r => (
            <div key={r.role} style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${r.color}30`, borderRadius: 24, padding: "36px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                <span style={{ fontSize: 32 }}>{r.icon}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: r.color }}>{r.role}</span>
              </div>
              {r.items.map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 4, background: r.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>{item}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* PRICING */}
      <div style={{ padding: "80px 100px", background: BG }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: 2, marginBottom: 20 }}>PRICING</div>
        <div style={{ fontSize: 48, fontWeight: 900, color: NAVY, letterSpacing: -1, marginBottom: 16, lineHeight: 1.1 }}>Simple, transparent pricing.</div>
        <div style={{ fontSize: 20, color: MUTED, marginBottom: 48 }}>All plans include a 6-month free trial. No credit card required.</div>
        <div style={{ display: "flex", gap: 24 }}>
          {PLANS.map(p => (
            <div key={p.name} style={{ flex: 1, background: p.highlight ? NAVY : WHITE, border: p.highlight ? `2px solid ${GOLD}` : `1px solid ${BORDER}`, borderRadius: 24, padding: "36px 32px", boxShadow: p.highlight ? `0 12px 40px rgba(30,58,138,0.25)` : "0 1px 6px rgba(0,0,0,0.06)", position: "relative" }}>
              {p.highlight && (
                <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: GOLD, borderRadius: 20, padding: "6px 20px", fontSize: 13, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ fontSize: 22, fontWeight: 800, color: p.highlight ? GOLD : NAVY, marginBottom: 8 }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 28 }}>
                <span style={{ fontSize: 52, fontWeight: 900, color: p.highlight ? WHITE : NAVY }}>{curr.format(p.price)}</span>
                <span style={{ fontSize: 18, color: p.highlight ? "rgba(255,255,255,0.5)" : MUTED }}>/mo</span>
              </div>
              {p.features.map(f => (
                <div key={f} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: p.highlight ? GOLD : "#22C55E", fontSize: 18, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 15, color: p.highlight ? "rgba(255,255,255,0.8)" : "#374151", fontWeight: 500 }}>{f}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ background: NAVY, padding: "80px 100px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: GOLD }} />
        <div style={{ fontSize: 56, fontWeight: 900, color: WHITE, letterSpacing: -1.5, lineHeight: 1.05, marginBottom: 24 }}>
          Ready to transform<br />your association?
        </div>
        <div style={{ fontSize: 22, color: "rgba(255,255,255,0.6)", marginBottom: 48, fontWeight: 400 }}>
          Join the growing community of associations on Stride.
        </div>
        <div style={{ display: "inline-flex", background: GOLD, borderRadius: 40, padding: "20px 60px" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>Start Free Trial at stride.app →</span>
        </div>
      </div>
    </div>
  );

  return (
    <ScaleToFit width={1200} height={3600} scrollable>
      {CONTENT}
    </ScaleToFit>
  );
}
