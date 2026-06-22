export default function Slide9Traction() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#F8FAFF", fontFamily: "Montserrat, sans-serif" }}>

      {/* Left accent */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: "1vw", background: "#1E3A8A" }} />

      {/* Header */}
      <div className="absolute" style={{ top: "7vh", left: "7vw", right: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "1.8vh" }}>WHERE WE ARE</div>
        <div style={{ fontSize: "5vw", fontWeight: 900, color: "#1E3A8A", letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: "1.5vh" }}>
          Built, validated, and ready.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24" }} />
      </div>

      {/* Left column: big stat + statement */}
      <div className="absolute" style={{ top: "30vh", left: "7vw", width: "44vw" }}>

        <div style={{ background: "#1E3A8A", borderRadius: "1.5vw", padding: "4vh 4vw", marginBottom: "3vh" }}>
          <div style={{ fontSize: "10vw", fontWeight: 900, color: "#FBBF24", lineHeight: 1 }}>v1</div>
          <div style={{ fontSize: "2vw", color: "rgba(255,255,255,0.75)", fontWeight: 500, marginTop: "1.5vh", lineHeight: 1.4 }}>Full platform shipped. Production-ready across all three roles.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3vh 3vw", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.12em", marginBottom: "1.5vh" }}>NEXT 12 MONTHS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "4vw", height: "4vw", borderRadius: "50%", background: "#F8FAFF", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.5vw", fontWeight: 900, color: "#1E3A8A" }}>1</span>
              </div>
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>App Store & Play Store launch</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "4vw", height: "4vw", borderRadius: "50%", background: "#F8FAFF", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.5vw", fontWeight: 900, color: "#1E3A8A" }}>2</span>
              </div>
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>First 50 paying associations</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "4vw", height: "4vw", borderRadius: "50%", background: "#F8FAFF", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.5vw", fontWeight: 900, color: "#1E3A8A" }}>3</span>
              </div>
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>Expand to France, Germany, Spain</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right column: feature checklist */}
      <div className="absolute" style={{ top: "30vh", right: "7vw", width: "38vw" }}>
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 3vw", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.12em", marginBottom: "2.5vh" }}>PLATFORM STATUS</div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>Three-role mobile app</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>Stripe payments integrated</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>QR + BLE attendance</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>AI roster optimizer</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>Emergency Pulse system</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>GDPR-compliant legal docs</span>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "center" }}>
              <div style={{ width: "2vw", height: "2vw", borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
              <span style={{ fontSize: "1.6vw", color: "#374151", fontWeight: 600 }}>Multi-currency, multi-org</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
