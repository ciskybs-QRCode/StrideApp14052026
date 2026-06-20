import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const BG = "#F8FAFF";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`;

const METRICS = [
  { label: "Active Students", value: "48",     icon: "👥", trend: "+12%", trendColor: "#16A34A" },
  { label: "Active Courses",  value: "7",      icon: "🎓", trend: "+2",   trendColor: "#16A34A" },
  { label: "Monthly Revenue", value: "€3,840", icon: "💰", trend: "+8%",  trendColor: "#16A34A" },
  { label: "Avg. Attendance", value: "87%",    icon: "✅", trend: "+3%",  trendColor: "#16A34A" },
];

const COURSES = [
  { name: "Ballet Baby — 4–6 yrs",    enrolled: 12, max: 14, pct: 86, dot: "#F9A8D4" },
  { name: "Ballet Junior — 7–10 yrs", enrolled: 15, max: 16, pct: 94, dot: "#F9A8D4" },
  { name: "Jazz & Musical — Kids",    enrolled: 16, max: 18, pct: 89, dot: "#FDE68A" },
  { name: "Hip-Hop Kids — 6–9 yrs",  enrolled: 18, max: 20, pct: 90, dot: "#BBF7D0" },
  { name: "Contemporary — Teen",      enrolled: 10, max: 12, pct: 83, dot: "#BFDBFE" },
  { name: "Gymnastics — 5–8 yrs",    enrolled: 14, max: 16, pct: 88, dot: "#FCD34D" },
  { name: "Ballet Senior — 11–16 yrs",enrolled: 13, max: 14, pct: 93, dot: "#F9A8D4" },
];

const RECENT = [
  { name: "Chiara De Luca",     joined: "June 2026",  courses: 2 },
  { name: "Leonardo Marino",    joined: "June 2026",  courses: 2 },
  { name: "Valentina Greco",    joined: "May 2026",   courses: 2 },
];

export default function AdminStats() {
  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: 430, minHeight: 932, background: BG, color: TEXT, overflowY: "auto" }}>
      <style>{montserrat}</style>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 20px 0", fontSize: 12, fontWeight: 600, color: MUTED }}>
        <span>9:41</span>
        <span>●●●● WiFi 🔋</span>
      </div>

      {/* Header */}
      <div style={{ padding: "20px 20px 20px", background: NAVY, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>Stride Dance Academy</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 2 }}>Statistics</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.5)", borderRadius: 20, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#4ADE80" }} />
              <span style={{ fontSize: 11, color: "#4ADE80", fontWeight: 700 }}>Trial active</span>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 19, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: NAVY }}>LF</div>
          </div>
        </div>

        {/* Period tabs */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 3, gap: 3 }}>
          {["This week", "This month", "Year"].map((p, i) => (
            <div key={p} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, background: i === 1 ? GOLD : "transparent", color: i === 1 ? NAVY : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: i === 1 ? 700 : 500 }}>
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {METRICS.map((m) => (
            <div key={m.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ fontSize: 26 }}>{m.icon}</div>
                <div style={{ fontSize: 11, color: m.trendColor, fontWeight: 700, background: "#DCFCE7", padding: "2px 8px", borderRadius: 10 }}>{m.trend}</div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>{m.value}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 4, fontWeight: 500 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Course occupancy */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1 }}>COURSE OCCUPANCY</div>
          <div style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>Manage →</div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          {COURSES.map((c, i) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: i < COURSES.length - 1 ? 12 : 0, marginBottom: i < COURSES.length - 1 ? 12 : 0, borderBottom: i < COURSES.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: c.dot, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{c.enrolled}/{c.max}</div>
                </div>
                <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3 }}>
                  <div style={{ width: `${c.pct}%`, height: "100%", background: c.dot, borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.pct > 90 ? "#DC2626" : "#16A34A", width: 36, textAlign: "right" }}>{c.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent members */}
      <div style={{ padding: "20px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1 }}>NEW MEMBERS</div>
          <div style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>See all (48) →</div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          {RECENT.map((m, i) => (
            <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < RECENT.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ width: 38, height: 38, borderRadius: 19, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: GOLD }}>
                {m.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>Joined: {m.joined} · {m.courses} courses</div>
              </div>
              <div style={{ fontSize: 18, color: MUTED }}>›</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", padding: "12px 0 26px", boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}>
        {[
          { icon: "⚙️", label: "Setup",        active: false },
          { icon: "👥", label: "Users",         active: false },
          { icon: "💬", label: "Comms",         active: false },
          { icon: "📊", label: "Stats",         active: true  },
          { icon: "🔧", label: "Settings",      active: false },
        ].map((tab) => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 20 }}>{tab.icon}</div>
            <div style={{ fontSize: 9, fontWeight: tab.active ? 700 : 500, color: tab.active ? NAVY : MUTED }}>{tab.label}</div>
            {tab.active && <div style={{ width: 20, height: 3, borderRadius: 2, background: GOLD }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
