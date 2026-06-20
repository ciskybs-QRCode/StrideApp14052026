export default function Slide5Features() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#F8FAFF", fontFamily: "Montserrat, sans-serif" }}>

      {/* Left accent */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: "1vw", background: "#1E3A8A" }} />

      {/* Header */}
      <div className="absolute" style={{ top: "6.5vh", left: "7vw", right: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "1.5vh" }}>PLATFORM FEATURES</div>
        <div style={{ fontSize: "4.8vw", fontWeight: 900, color: "#1E3A8A", letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: "1.5vh" }}>
          Six capabilities that matter.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24" }} />
      </div>

      {/* 2x3 feature grid */}
      <div className="absolute" style={{ top: "29vh", left: "7vw", right: "7vw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "2vh 2vw" }}>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.2vw", padding: "2.8vh 2.2vw", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.1em", marginBottom: "1.2vh" }}>ATTENDANCE</div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1vh", lineHeight: 1.2 }}>QR + BLE proximity</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.5 }}>Instant check-in. Automatic roll call. Zero paper.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.2vw", padding: "2.8vh 2.2vw", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.1em", marginBottom: "1.2vh" }}>SAFETY</div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1vh", lineHeight: 1.2 }}>Smart Pick-Up</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.5 }}>Authorized guardian verification at the door.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.2vw", padding: "2.8vh 2.2vw", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.1em", marginBottom: "1.2vh" }}>PAYMENTS</div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1vh", lineHeight: 1.2 }}>Stripe-powered checkout</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.5 }}>Courses, events, marketplace. Multi-currency.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.2vw", padding: "2.8vh 2.2vw", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.1em", marginBottom: "1.2vh" }}>EMERGENCY</div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1vh", lineHeight: 1.2 }}>Emergency Pulse</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.5 }}>Critical alerts reach all parents in seconds.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.2vw", padding: "2.8vh 2.2vw", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.1em", marginBottom: "1.2vh" }}>ANALYTICS</div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1vh", lineHeight: 1.2 }}>Live dashboard</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.5 }}>Revenue, occupancy, attendance — all real-time.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.2vw", padding: "2.8vh 2.2vw", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.1em", marginBottom: "1.2vh" }}>COMPLIANCE</div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1vh", lineHeight: 1.2 }}>Digital contracts</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.5 }}>GDPR consent, media releases, SHA-256 audit.</div>
        </div>
      </div>
    </div>
  );
}
