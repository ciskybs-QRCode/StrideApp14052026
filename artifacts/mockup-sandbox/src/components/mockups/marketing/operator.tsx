import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const WHITE = "#FFFFFF";
const CARD_BG = "rgba(255,255,255,0.08)";
const CARD_BORDER = "rgba(255,255,255,0.12)";

const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`;

const TODAY_CLASSES = [
  { time: "16:00", name: "Ballet Baby — 4/6 anni",    room: "Sala A", enrolled: 12, present: 10, max: 14, color: "#E8B4C8" },
  { time: "16:30", name: "Ballet Junior — 7/10 anni", room: "Sala B", enrolled: 15, present: 13, max: 16, color: "#E8B4C8" },
  { time: "17:00", name: "Ginnastica Base",            room: "Sala C", enrolled: 14, present: 11, max: 16, color: "#FFB347" },
  { time: "17:00", name: "Ballet Senior — 11/16 anni", room: "Sala A", enrolled: 13, present: 12, max: 14, color: "#E8B4C8" },
  { time: "18:00", name: "Contemporanea — Teen",       room: "Sala B", enrolled: 11, present: 9,  max: 12, color: "#9BB5D6" },
];

const STUDENTS = [
  { name: "Emma Conti",         present: true  },
  { name: "Matteo Conti",       present: true  },
  { name: "Sofia Ferretti",     present: false },
  { name: "Giulia Rossi",       present: true  },
  { name: "Alessandro Bianchi", present: true  },
];

export default function OperatorDashboard() {
  const presentCount = TODAY_CLASSES.reduce((a, c) => a + c.present, 0);
  const totalEnrolled = TODAY_CLASSES.reduce((a, c) => a + c.enrolled, 0);

  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: 430, minHeight: 932, background: NAVY, color: WHITE, overflowY: "auto", position: "relative" }}>
      <style>{montserrat}</style>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 0", fontSize: 13, fontWeight: 600, opacity: 0.7 }}>
        <span>9:41</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span>●●●●</span><span>WiFi</span><span>🔋</span>
        </span>
      </div>

      {/* Header */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 500 }}>Sabato 20 Giugno 2026</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>Dashboard</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🚨</div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: NAVY }}>MB</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {[
            { label: "Presenti oggi", value: presentCount, total: totalEnrolled, icon: "👥", color: "#4ADE80" },
            { label: "Classi attive", value: 5, total: 5, icon: "🎓", color: GOLD },
            { label: "Smart Pick-Up", value: 3, total: 5, icon: "📍", color: "#60A5FA" },
          ].map((stat) => (
            <div key={stat.label} style={{ flex: 1, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 500, marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* QR Scanner CTA */}
        <div style={{ marginTop: 14, background: "linear-gradient(135deg, #FBBF24, #F59E0B)", borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32 }}>📷</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: NAVY, fontWeight: 800, fontSize: 16 }}>Scanner QR Presenze</div>
            <div style={{ color: `${NAVY}99`, fontSize: 12, fontWeight: 500 }}>Scansiona il badge dell'allievo</div>
          </div>
          <div style={{ background: NAVY, borderRadius: 10, padding: "8px 14px", color: GOLD, fontWeight: 700, fontSize: 13 }}>Apri</div>
        </div>
      </div>

      {/* Today's schedule */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1, marginBottom: 12 }}>PROGRAMMA DI OGGI</div>
        {TODAY_CLASSES.map((cls, i) => {
          const pct = Math.round((cls.present / cls.enrolled) * 100);
          return (
            <div key={i} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{cls.time}</div>
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>{cls.room}</div>
              </div>
              <div style={{ width: 3, alignSelf: "stretch", background: cls.color, borderRadius: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{cls.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: cls.color, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>{cls.present}/{cls.enrolled}</div>
                </div>
              </div>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>›</div>
            </div>
          );
        })}
      </div>

      {/* Roll call snapshot */}
      <div style={{ padding: "12px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1 }}>APPELLO — BALLET BABY 16:00</div>
          <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>Vedi tutto →</div>
        </div>
        {STUDENTS.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${CARD_BORDER}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 17, background: s.present ? "rgba(74,222,128,0.15)" : "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {s.present ? "✅" : "❌"}
            </div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: s.present ? "#4ADE80" : "#F87171", fontWeight: 600 }}>
              {s.present ? "Presente" : "Assente"}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, background: `${NAVY}EE`, backdropFilter: "blur(10px)", borderTop: `1px solid ${CARD_BORDER}`, display: "flex", padding: "12px 0 24px" }}>
        {[
          { icon: "🏠", label: "Dashboard", active: true },
          { icon: "📅", label: "Calendario", active: false },
          { icon: "👥", label: "Allievi", active: false },
          { icon: "💼", label: "Stipendi", active: false },
        ].map((tab) => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 22 }}>{tab.icon}</div>
            <div style={{ fontSize: 10, fontWeight: tab.active ? 700 : 500, color: tab.active ? GOLD : `${WHITE}66` }}>{tab.label}</div>
            {tab.active && <div style={{ width: 4, height: 4, borderRadius: 2, background: GOLD }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
