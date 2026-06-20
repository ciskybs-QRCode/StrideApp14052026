import React from "react";

const NAVY = "#1E3A8A";
const GOLD = "#FBBF24";
const BG = "#F8FAFF";
const CARD = "#FFFFFF";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const montserrat = `@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');`;

const CHILDREN = [
  {
    name: "Emma Conti",
    age: 8,
    initials: "EC",
    courses: [
      { name: "Ballet Baby",    day: "Mon", time: "4:00–5:00 PM", dot: "#F9A8D4" },
      { name: "Gymnastics",     day: "Mon", time: "5:00–6:00 PM", dot: "#FCD34D" },
    ],
  },
  {
    name: "Matteo Conti",
    age: 10,
    initials: "MC",
    courses: [
      { name: "Ballet Junior",  day: "Wed", time: "4:30–6:00 PM", dot: "#F9A8D4" },
      { name: "Jazz & Musical", day: "Tue", time: "5:00–6:30 PM", dot: "#FDE68A" },
    ],
  },
];

export default function ParentHome() {
  return (
    <div style={{ fontFamily: "Montserrat, sans-serif", width: 430, minHeight: 932, background: BG, color: TEXT, overflowY: "auto" }}>
      <style>{montserrat}</style>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 20px 0", fontSize: 12, fontWeight: 600, color: MUTED }}>
        <span>9:41</span>
        <span>●●●● WiFi 🔋</span>
      </div>

      {/* Header */}
      <div style={{ padding: "20px 20px 12px", background: NAVY, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>Good morning, Maria 👋</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 2 }}>Your Family</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔔</div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: NAVY }}>MC</div>
          </div>
        </div>

        {/* Next lesson */}
        <div style={{ marginTop: 16, marginBottom: 20, background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(251,191,36,0.3)" }}>
          <span style={{ fontSize: 22 }}>⏰</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 0.5 }}>NEXT CLASS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>Ballet Baby · Mon 4:00 PM</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Instr. Giulia M. · Studio A</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "#4ADE80" }} />
        </div>
      </div>

      {/* Children */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 14 }}>YOUR CHILDREN</div>

        {CHILDREN.map((child) => (
          <div key={child.name} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16, marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: GOLD }}>
                {child.initials}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{child.name}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{child.age} years old · {child.courses.length} active courses</div>
              </div>
              <div style={{ fontSize: 12, color: NAVY, fontWeight: 700 }}>Details →</div>
            </div>
            {child.courses.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8FAFF", borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, background: c.dot }} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{c.day} · {c.time}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Upcoming event */}
      <div style={{ padding: "4px 20px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 14 }}>UPCOMING EVENTS</div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: `${NAVY}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>🎭</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>End of Year Show — Summer 2026</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 2 }}>📅 July 4–5, 2026</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>📍 Teatro Comunale, Milan</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ background: GOLD, color: NAVY, fontWeight: 700, fontSize: 12, padding: "7px 16px", borderRadius: 20 }}>Buy Tickets</div>
                <div style={{ background: "#F1F5F9", color: TEXT, fontWeight: 600, fontSize: 12, padding: "7px 16px", borderRadius: 20 }}>Info</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wallet */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 14 }}>WALLET</div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Monthly fee</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>€145<span style={{ fontSize: 14, color: MUTED }}>/mo</span></div>
            <div style={{ fontSize: 12, color: "#22C55E", marginTop: 4, fontWeight: 600 }}>✓ Next payment: July 5</div>
          </div>
          <div style={{ background: NAVY, color: GOLD, fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 20 }}>Manage</div>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 24, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", padding: "12px 0 26px", boxShadow: "0 -2px 12px rgba(0,0,0,0.06)" }}>
        {[
          { icon: "🏠", label: "Home",      active: true  },
          { icon: "🎓", label: "Courses",   active: false },
          { icon: "💳", label: "Wallet",    active: false },
          { icon: "📋", label: "Documents", active: false },
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
