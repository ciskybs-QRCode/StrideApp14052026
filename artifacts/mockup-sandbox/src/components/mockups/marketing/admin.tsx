import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const WHITE = "#FFFFFF";
const CARD_BG = "rgba(255,255,255,0.08)";
const CARD_BORDER = "rgba(255,255,255,0.12)";

const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`;

const METRICS = [
  { label: "Allievi Attivi", value: "48", icon: "👥", trend: "+12%", color: "#4ADE80" },
  { label: "Corsi Attivi",   value: "7",  icon: "🎓", trend: "+2",   color: GOLD    },
  { label: "Entrate Mese",   value: "€3.840", icon: "💰", trend: "+8%", color: "#60A5FA" },
  { label: "Presenze Media", value: "87%", icon: "✅", trend: "+3%", color: "#A78BFA" },
];

const COURSES = [
  { name: "Ballet Baby — 4/6 anni",     enrolled: 12, max: 14, pct: 86, color: "#E8B4C8" },
  { name: "Ballet Junior — 7/10 anni",  enrolled: 15, max: 16, pct: 94, color: "#E8B4C8" },
  { name: "Jazz & Musical — Ragazzi",   enrolled: 16, max: 18, pct: 89, color: "#F5C842" },
  { name: "Hip-Hop Kids — 6/9 anni",    enrolled: 18, max: 20, pct: 90, color: "#A8D8A8" },
  { name: "Contemporanea — Teen",        enrolled: 10, max: 12, pct: 83, color: "#9BB5D6" },
  { name: "Ginnastica Base — 5/8 anni", enrolled: 14, max: 16, pct: 88, color: "#FFB347" },
  { name: "Ballet Senior — 11/16 anni", enrolled: 13, max: 14, pct: 93, color: "#E8B4C8" },
];

const RECENT_MEMBERS = [
  { name: "Chiara De Luca",     joined: "Giugno 2026", courses: 2 },
  { name: "Leonardo Marino",    joined: "Giugno 2026", courses: 2 },
  { name: "Valentina Greco",    joined: "Maggio 2026", courses: 2 },
];

export default function AdminStats() {
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
            <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 500 }}>Stride Dance Academy</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>Statistiche</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.4)", borderRadius: 10, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: "#4ADE80" }} />
              <span style={{ fontSize: 12, color: "#4ADE80", fontWeight: 700 }}>Trial attivo</span>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: NAVY }}>LF</div>
          </div>
        </div>

        {/* Period selector */}
        <div style={{ marginTop: 16, display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 4, gap: 4 }}>
          {["Questa settimana", "Questo mese", "Anno"].map((p, i) => (
            <div key={p} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 8, background: i === 1 ? GOLD : "transparent", color: i === 1 ? NAVY : `${WHITE}80`, fontSize: 12, fontWeight: i === 1 ? 700 : 500, cursor: "pointer" }}>
              {p}
            </div>
          ))}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {METRICS.map((m) => (
            <div key={m.label} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 24 }}>{m.icon}</div>
                <div style={{ fontSize: 11, color: m.color, fontWeight: 700, background: `${m.color}20`, padding: "2px 8px", borderRadius: 10 }}>{m.trend}</div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, fontWeight: 500 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Course occupancy */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1 }}>OCCUPAZIONE CORSI</div>
          <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>Gestisci →</div>
        </div>
        {COURSES.map((c) => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{c.enrolled}/{c.max}</div>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                <div style={{ width: `${c.pct}%`, height: "100%", background: c.color, borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.pct > 90 ? "#F87171" : "#4ADE80", width: 36, textAlign: "right" }}>{c.pct}%</div>
          </div>
        ))}
      </div>

      {/* Recent members */}
      <div style={{ padding: "12px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1 }}>NUOVI ISCRITTI</div>
          <div style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>Vedi tutti (48) →</div>
        </div>
        {RECENT_MEMBERS.map((m) => (
          <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${CARD_BORDER}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: NAVY, flexShrink: 0 }}>
              {m.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 12, opacity: 0.55 }}>Iscritto: {m.joined} · {m.courses} corsi</div>
            </div>
            <div style={{ fontSize: 18, opacity: 0.4 }}>›</div>
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, background: `${NAVY}EE`, backdropFilter: "blur(10px)", borderTop: `1px solid ${CARD_BORDER}`, display: "flex", padding: "12px 0 24px" }}>
        {[
          { icon: "⚙️", label: "Setup",         active: false },
          { icon: "👥", label: "Utenti",         active: false },
          { icon: "💬", label: "Comunicazioni",  active: false },
          { icon: "📊", label: "Statistiche",    active: true  },
          { icon: "🔧", label: "Impostazioni",   active: false },
        ].map((tab) => (
          <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 20 }}>{tab.icon}</div>
            <div style={{ fontSize: 9, fontWeight: tab.active ? 700 : 500, color: tab.active ? GOLD : `${WHITE}66` }}>{tab.label}</div>
            {tab.active && <div style={{ width: 4, height: 4, borderRadius: 2, background: GOLD }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
