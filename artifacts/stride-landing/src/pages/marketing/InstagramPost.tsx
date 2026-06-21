import React, { useEffect, useState } from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');`;

export default function InstagramPost() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => (n + 1) % 3), 2800);
    return () => clearInterval(t);
  }, []);

  const features = [
    { icon: "📷", text: "QR Attendance" },
    { icon: "📍", text: "Smart Pick-Up" },
    { icon: "🚨", text: "Emergency Pulse" },
    { icon: "💳", text: "Online Payments" },
    { icon: "📊", text: "Live Statistics" },
    { icon: "📋", text: "Digital Contracts" },
  ];

  const slides = [
    {
      tag: "For Parents",
      headline: "Your kids.\nAlways safe.",
      sub: "Real-time attendance, Smart Pick-Up alerts, and instant emergency notifications — all in one app.",
      accent: "#FBBF24",
    },
    {
      tag: "For Operators",
      headline: "Every class.\nUnder control.",
      sub: "QR scanner, roll call, substitute management, and payroll — so you can focus on teaching.",
      accent: "#60A5FA",
    },
    {
      tag: "For Admins",
      headline: "Your school.\nYour data.",
      sub: "Revenue tracking, course occupancy, member analytics and white-label branding in one dashboard.",
      accent: "#4ADE80",
    },
  ];

  const s = slides[tick];

  return (
    <div style={{ width: "100vw", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e" }}>
      <div style={{ fontFamily: "Montserrat, sans-serif", width: 1080, height: 1080, background: NAVY, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <style>{montserrat}</style>
        <div style={{ position: "absolute", top: -120, right: -120, width: 500, height: 500, borderRadius: "50%", border: `2px solid rgba(251,191,36,0.15)` }} />
        <div style={{ position: "absolute", top: -60, right: -60, width: 350, height: 350, borderRadius: "50%", border: `2px solid rgba(251,191,36,0.1)` }} />
        <div style={{ position: "absolute", bottom: 80, left: -100, width: 400, height: 400, borderRadius: "50%", border: `2px solid rgba(255,255,255,0.05)` }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: GOLD }} />
        <div style={{ padding: "52px 60px 0", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: NAVY }}>S</span>
          </div>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>STRIDE</span>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px" }}>
          <div style={{ display: "inline-flex", alignSelf: "flex-start", background: `${s.accent}22`, border: `1px solid ${s.accent}60`, borderRadius: 30, padding: "10px 22px", marginBottom: 32 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: s.accent, letterSpacing: 2 }}>{s.tag.toUpperCase()}</span>
          </div>
          <div style={{ fontSize: 88, fontWeight: 900, color: "#fff", lineHeight: 1.05, marginBottom: 36, whiteSpace: "pre-line", letterSpacing: -2 }}>
            {s.headline}
          </div>
          <div style={{ fontSize: 26, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, fontWeight: 400, maxWidth: 740, marginBottom: 60 }}>
            {s.sub}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ height: 5, borderRadius: 3, background: i === tick ? GOLD : "rgba(255,255,255,0.25)", width: i === tick ? 48 : 20, transition: "all 0.4s ease" }} />
            ))}
          </div>
        </div>
        <div style={{ padding: "0 60px 56px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: 2, marginBottom: 20 }}>EVERYTHING YOUR SCHOOL NEEDS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {features.map(f => (
              <div key={f.text} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 30, padding: "10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{f.icon}</span>
                <span style={{ fontSize: 17, fontWeight: 600, color: "#fff" }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.3)", borderTop: `1px solid rgba(255,255,255,0.08)`, padding: "24px 60px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 20, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>stride.app</span>
          <span style={{ fontSize: 20, color: GOLD, fontWeight: 700 }}>Run your school. Not your spreadsheets.</span>
        </div>
      </div>
    </div>
  );
}
