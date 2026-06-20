import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const WHITE = "#FFFFFF";
const CARD_BG = "rgba(255,255,255,0.08)";
const CARD_BORDER = "rgba(255,255,255,0.12)";

const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`;

const CHILDREN = [
  {
    name: "Emma Conti",
    age: 8,
    initials: "EC",
    courses: [
      { name: "Ballet Baby", day: "Lunedì", time: "16:00–17:00", color: "#E8B4C8" },
      { name: "Ginnastica Base", day: "Lunedì", time: "17:00–18:00", color: "#FFB347" },
    ],
  },
  {
    name: "Matteo Conti",
    age: 10,
    initials: "MC",
    courses: [
      { name: "Ballet Junior", day: "Mercoledì", time: "16:30–18:00", color: "#E8B4C8" },
      { name: "Jazz & Musical", day: "Martedì", time: "17:00–18:30", color: "#F5C842" },
    ],
  },
];

const NEXT_LESSON = { course: "Ballet Baby", day: "Lunedì", time: "16:00", instructor: "Istr. Giulia M.", studio: "Sala A" };
const EVENT = { title: "Saggio di Fine Anno — Estate 2026", date: "4–5 Luglio 2026", location: "Teatro Comunale, Milano", tickets: 2 };

export default function ParentHome() {
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
            <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 500 }}>Ciao, Maria 👋</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>La tua famiglia</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔔</div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: NAVY }}>MC</div>
          </div>
        </div>

        {/* Next lesson pill */}
        <div style={{ marginTop: 16, background: "rgba(251,191,36,0.15)", border: `1px solid ${GOLD}40`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⏰</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 500 }}>PROSSIMA LEZIONE</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{NEXT_LESSON.course} · {NEXT_LESSON.day} {NEXT_LESSON.time}</div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>{NEXT_LESSON.instructor} · {NEXT_LESSON.studio}</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "#4ADE80" }} />
        </div>
      </div>

      {/* Children section */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1, marginBottom: 12 }}>I TUOI FIGLI</div>
        {CHILDREN.map((child) => (
          <div key={child.name} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: NAVY, flexShrink: 0 }}>
                {child.initials}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{child.name}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{child.age} anni · {child.courses.length} corsi attivi</div>
              </div>
              <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, cursor: "pointer" }}>Dettagli →</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {child.courses.map((c) => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: c.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.55 }}>{c.day} {c.time}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Event banner */}
      <div style={{ padding: "4px 20px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1, marginBottom: 12 }}>EVENTI IN ARRIVO</div>
        <div style={{ background: "linear-gradient(135deg, #7C3AED22, #FBBF2422)", border: `1px solid ${GOLD}40`, borderRadius: 16, padding: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -20, right: -20, fontSize: 80, opacity: 0.08 }}>🎭</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎭</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{EVENT.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2 }}>📅 {EVENT.date}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>📍 {EVENT.location}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ background: GOLD, color: NAVY, fontWeight: 700, fontSize: 12, padding: "6px 14px", borderRadius: 20 }}>Acquista Biglietti</div>
                <div style={{ background: CARD_BG, color: WHITE, fontWeight: 600, fontSize: 12, padding: "6px 14px", borderRadius: 20, border: `1px solid ${CARD_BORDER}` }}>Info</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet quick card */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 1, marginBottom: 12 }}>PORTAFOGLIO</div>
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>Quota mensile</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>€145<span style={{ fontSize: 14, opacity: 0.6 }}>/mese</span></div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, color: "#4ADE80" }}>✓ Pagamento prossimo: 5 Luglio</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 6 }}>Piani assicurativi</div>
            <div style={{ background: GOLD, color: NAVY, fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 20 }}>Gestisci</div>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, background: `${NAVY}EE`, backdropFilter: "blur(10px)", borderTop: `1px solid ${CARD_BORDER}`, display: "flex", padding: "12px 0 24px" }}>
        {[
          { icon: "🏠", label: "Home", active: true },
          { icon: "🎓", label: "Corsi", active: false },
          { icon: "💳", label: "Wallet", active: false },
          { icon: "📋", label: "Documenti", active: false },
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
