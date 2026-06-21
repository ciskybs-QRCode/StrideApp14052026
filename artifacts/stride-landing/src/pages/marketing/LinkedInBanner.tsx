import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');`;

const STATS = [
  { value: "48",    label: "Students managed" },
  { value: "87%",   label: "Avg. attendance" },
  { value: "€3.8k", label: "Monthly revenue tracked" },
  { value: "3",     label: "Roles, one platform" },
];

export default function LinkedInBanner() {
  return (
    <div style={{ width: "100vw", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1e" }}>
      <div style={{ fontFamily: "Montserrat, sans-serif", width: 1200, height: 628, background: NAVY, position: "relative", overflow: "hidden", display: "flex" }}>
        <style>{montserrat}</style>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>S</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>STRIDE</span>
            <div style={{ height: 20, width: 1, background: "rgba(255,255,255,0.2)", margin: "0 4px" }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.5)", letterSpacing: 2 }}>DANCE SCHOOL MANAGEMENT</span>
          </div>
          <div style={{ fontSize: 58, fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 24 }}>
            Run your school.<br />
            <span style={{ color: GOLD }}>Not your spreadsheets.</span>
          </div>
          <div style={{ fontSize: 20, color: "rgba(255,255,255,0.65)", fontWeight: 400, lineHeight: 1.5, marginBottom: 40, maxWidth: 480 }}>
            The all-in-one platform for dance schools — attendance, payments, communications and analytics.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ background: GOLD, borderRadius: 30, padding: "14px 32px" }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>Start Free Trial</span>
            </div>
            <span style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>stride.app</span>
          </div>
        </div>
        <div style={{ width: 360, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px 0 0", gap: 20, position: "relative", zIndex: 2 }}>
          {STATS.map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "20px 24px" }}>
              <div style={{ fontSize: 38, fontWeight: 900, color: GOLD, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 6, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", top: -150, right: 300, width: 500, height: 500, borderRadius: "50%", border: "1px solid rgba(251,191,36,0.08)", zIndex: 1 }} />
        <div style={{ position: "absolute", bottom: -200, right: 200, width: 600, height: 600, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.04)", zIndex: 1 }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: GOLD, zIndex: 3 }} />
      </div>
    </div>
  );
}
