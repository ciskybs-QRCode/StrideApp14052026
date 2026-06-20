import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');`;

const ROLES = [
  {
    icon: "👨‍👩‍👧",
    role: "Parents",
    color: "#FBBF24",
    bg: "rgba(251,191,36,0.12)",
    points: ["Real-time attendance updates", "Smart Pick-Up alerts", "Event tickets & payments"],
  },
  {
    icon: "🎓",
    role: "Operators",
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.12)",
    points: ["QR check-in scanner", "Daily roll call & roster", "Payroll & scheduling"],
  },
  {
    icon: "⚙️",
    role: "Admins",
    color: "#4ADE80",
    bg: "rgba(74,222,128,0.12)",
    points: ["Revenue & stats dashboard", "Member & course management", "White-label branding"],
  },
];

export default function InstagramStory() {
  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: 1080, height: 1920, background: NAVY, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{montserrat}</style>

      {/* Background geometric */}
      <div style={{ position: "absolute", top: -200, right: -200, width: 700, height: 700, borderRadius: "50%", border: `1px solid rgba(251,191,36,0.1)` }} />
      <div style={{ position: "absolute", top: -100, right: -100, width: 500, height: 500, borderRadius: "50%", border: `1px solid rgba(251,191,36,0.08)` }} />
      <div style={{ position: "absolute", bottom: -150, left: -150, width: 600, height: 600, borderRadius: "50%", border: `1px solid rgba(255,255,255,0.05)` }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: GOLD }} />

      {/* Progress bars (story-style) */}
      <div style={{ padding: "28px 40px 0", display: "flex", gap: 8 }}>
        {[1, 0.4, 0.2].map((w, i) => (
          <div key={i} style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${w * 100}%`, height: "100%", background: "#fff", borderRadius: 2 }} />
          </div>
        ))}
      </div>

      {/* Top: Logo + handle */}
      <div style={{ padding: "28px 40px 0", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: NAVY }}>S</span>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>stride.app</div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}>Dance School Management</div>
        </div>
      </div>

      {/* Hero headline */}
      <div style={{ padding: "60px 40px 0", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, letterSpacing: 3, marginBottom: 24 }}>INTRODUCING STRIDE</div>
        <div style={{ fontSize: 80, fontWeight: 900, color: "#fff", lineHeight: 1.0, letterSpacing: -2, marginBottom: 24 }}>
          One app.<br />Three views.<br />Zero chaos.
        </div>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.6)", fontWeight: 400, lineHeight: 1.5, maxWidth: 780, margin: "0 auto" }}>
          Built for every person in your dance school — parents, teachers, and directors.
        </div>
      </div>

      {/* Gold divider */}
      <div style={{ margin: "52px 40px 0", height: 2, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />

      {/* 3 role cards */}
      <div style={{ padding: "44px 40px 0", display: "flex", flexDirection: "column", gap: 24 }}>
        {ROLES.map(r => (
          <div key={r.role} style={{ background: r.bg, border: `1px solid ${r.color}30`, borderRadius: 24, padding: "28px 32px", display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: `${r.color}20`, border: `1px solid ${r.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>
              {r.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: r.color, marginBottom: 14 }}>{r.role}</div>
              {r.points.map(p => (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 19, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Swipe up CTA */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 40px 80px", textAlign: "center" }}>
        <div style={{ background: GOLD, borderRadius: 60, padding: "28px 72px", marginBottom: 28 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>Start Free Trial →</span>
        </div>
        <div style={{ fontSize: 20, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>stride.app · No credit card required</div>
      </div>
    </div>
  );
}
