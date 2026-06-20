export default function Slide4Roles() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#F8FAFF", fontFamily: "Montserrat, sans-serif" }}>

      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: "1vw", background: "#1E3A8A" }} />

      {/* Header */}
      <div className="absolute" style={{ top: "7vh", left: "7vw", right: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "1.8vh" }}>THREE VIEWS. ONE PLATFORM.</div>
        <div style={{ fontSize: "5vw", fontWeight: 900, color: "#1E3A8A", letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: "1.5vh" }}>
          Built for everyone in the school.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24" }} />
      </div>

      {/* Three role cards */}
      <div className="absolute" style={{ top: "32vh", left: "7vw", right: "7vw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5vw" }}>

        {/* Parents */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 2.5vw", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.12em", marginBottom: "2vh" }}>PARENTS</div>
          <div style={{ fontSize: "2.4vw", fontWeight: 900, color: "#1E3A8A", lineHeight: 1.1, marginBottom: "2.5vh" }}>Always in the loop.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Live attendance notifications</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Smart Pick-Up authorization</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Course booking and payments</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Digital document signing</span>
            </div>
          </div>
        </div>

        {/* Operators — highlighted */}
        <div style={{ background: "#1E3A8A", border: "2px solid #FBBF24", borderRadius: "1.5vw", padding: "3.5vh 2.5vw", boxShadow: "0 8px 32px rgba(30,58,138,0.25)" }}>
          <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.12em", marginBottom: "2vh" }}>OPERATORS</div>
          <div style={{ fontSize: "2.4vw", fontWeight: 900, color: "#fff", lineHeight: 1.1, marginBottom: "2.5vh" }}>Every class runs well.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.8)", fontWeight: 500, lineHeight: 1.4 }}>QR scanner and roll call</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.8)", fontWeight: 500, lineHeight: 1.4 }}>Substitute management and cascades</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.8)", fontWeight: 500, lineHeight: 1.4 }}>Payroll and scheduling</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.8)", fontWeight: 500, lineHeight: 1.4 }}>SOS emergency broadcast</span>
            </div>
          </div>
        </div>

        {/* Admins */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 2.5vw", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.12em", marginBottom: "2vh" }}>ADMINS</div>
          <div style={{ fontSize: "2.4vw", fontWeight: 900, color: "#1E3A8A", lineHeight: 1.1, marginBottom: "2.5vh" }}>The whole picture.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Revenue and attendance analytics</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Member and course management</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>White-label branding</span>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
              <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#FBBF24", marginTop: "0.8vh", flexShrink: 0 }} />
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500, lineHeight: 1.4 }}>Legal compliance tools</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
