import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const BG = "#F8FAFF";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`;

const TODAY_CLASSES = [
  { time: "4:00 PM",  name: "Ballet Baby — 4–6 yrs",    room: "Studio A", present: 10, enrolled: 12, max: 14, dot: "#F9A8D4" },
  { time: "4:30 PM",  name: "Ballet Junior — 7–10 yrs",  room: "Studio B", present: 13, enrolled: 15, max: 16, dot: "#F9A8D4" },
  { time: "5:00 PM",  name: "Gymnastics — 5–8 yrs",      room: "Studio C", present: 11, enrolled: 14, max: 16, dot: "#FCD34D" },
  { time: "5:00 PM",  name: "Ballet Senior — 11–16 yrs", room: "Studio A", present: 12, enrolled: 13, max: 14, dot: "#F9A8D4" },
  { time: "6:00 PM",  name: "Contemporary — Teen",       room: "Studio B", present: 9,  enrolled: 11, max: 12, dot: "#93C5FD" },
];

const ROLL_CALL = [
  { name: "Emma Conti",         present: true  },
  { name: "Matteo Conti",       present: true  },
  { name: "Sofia Ferretti",     present: false },
  { name: "Giulia Rossi",       present: true  },
  { name: "Alessandro Bianchi", present: true  },
];

export default function OperatorDashboard() {
  const totalPresent  = TODAY_CLASSES.reduce((a, c) => a + c.present, 0);
  const totalEnrolled = TODAY_CLASSES.reduce((a, c) => a + c.enrolled, 0);

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
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>Saturday, June 20, 2026</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 2 }}>Dashboard</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🚨</div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: NAVY }}>MB</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Present today", value: `${totalPresent}/${totalEnrolled}`, icon: "👥", color: "#4ADE80" },
            { label: "Active classes",  value: "5",    icon: "🎓", color: GOLD },
            { label: "Smart Pick-Up",   value: "3/5",  icon: "📍", color: "#93C5FD" },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Scanner button */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ background: GOLD, borderRadius: 18, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 14px rgba(251,191,36,0.35)" }}>
          <div style={{ fontSize: 34 }}>📷</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: NAVY, fontWeight: 800, fontSize: 16 }}>QR Attendance Scanner</div>
            <div style={{ color: `${NAVY}99`, fontSize: 12, fontWeight: 500 }}>Scan student badge to check in</div>
          </div>
          <div style={{ background: NAVY, borderRadius: 12, padding: "8px 16px", color: GOLD, fontWeight: 700, fontSize: 13 }}>Open</div>
        </div>
      </div>

      {/* Today's schedule */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 14 }}>TODAY'S SCHEDULE</div>
        {TODAY_CLASSES.map((cls, i) => {
          const pct = Math.round((cls.present / cls.enrolled) * 100);
          return (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ textAlign: "center", flexShrink: 0, minWidth: 52 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{cls.time}</div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{cls.room}</div>
              </div>
              <div style={{ width: 3, alignSelf: "stretch", background: cls.dot, borderRadius: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{cls.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 5, background: "#F1F5F9", borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: cls.dot, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{cls.present}/{cls.enrolled}</div>
                </div>
              </div>
              <div style={{ fontSize: 18, color: MUTED }}>›</div>
            </div>
          );
        })}
      </div>

      {/* Roll call */}
      <div style={{ padding: "12px 20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1 }}>ROLL CALL — BALLET BABY 4:00 PM</div>
          <div style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>See all →</div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          {ROLL_CALL.map((s, i) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < ROLL_CALL.length - 1 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, background: s.present ? "#DCFCE7" : "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                {s.present ? "✅" : "❌"}
              </div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: s.present ? "#16A34A" : "#DC2626", fontWeight: 700 }}>
                {s.present ? "Present" : "Absent"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", padding: "12px 0 26px", boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}>
        {[
          { icon: "🏠", label: "Dashboard", active: true  },
          { icon: "📅", label: "Calendar",  active: false },
          { icon: "👥", label: "Students",  active: false },
          { icon: "💼", label: "Payroll",   active: false },
        ].map((tab) => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 22 }}>{tab.icon}</div>
            <div style={{ fontSize: 10, fontWeight: tab.active ? 700 : 500, color: tab.active ? NAVY : MUTED }}>{tab.label}</div>
            {tab.active && <div style={{ width: 20, height: 3, borderRadius: 2, background: GOLD }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
