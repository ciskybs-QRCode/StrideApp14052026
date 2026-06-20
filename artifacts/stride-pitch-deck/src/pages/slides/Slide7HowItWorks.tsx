export default function Slide7HowItWorks() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#F8FAFF", fontFamily: "Montserrat, sans-serif" }}>

      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: "1vw", background: "#1E3A8A" }} />

      {/* Header */}
      <div className="absolute" style={{ top: "7vh", left: "7vw", right: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "1.8vh" }}>HOW IT WORKS</div>
        <div style={{ fontSize: "5vw", fontWeight: 900, color: "#1E3A8A", letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: "1.5vh" }}>
          Up and running in one day.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24" }} />
      </div>

      {/* Steps horizontal flow */}
      <div className="absolute" style={{ top: "36vh", left: "7vw", right: "7vw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2vw", alignItems: "start" }}>

        <div style={{ textAlign: "center" }}>
          <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "#1E3A8A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2.5vh" }}>
            <span style={{ fontSize: "3.5vw", fontWeight: 900, color: "#FBBF24" }}>1</span>
          </div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>School setup</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.6 }}>Admin configures courses, disciplines, branding, and pricing in the setup wizard.</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "#1E3A8A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2.5vh" }}>
            <span style={{ fontSize: "3.5vw", fontWeight: 900, color: "#FBBF24" }}>2</span>
          </div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>Member onboarding</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.6 }}>Parents register, add dependents, sign consents, and enroll in courses from the app.</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "#1E3A8A", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2.5vh" }}>
            <span style={{ fontSize: "3.5vw", fontWeight: 900, color: "#FBBF24" }}>3</span>
          </div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>Daily operations</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.6 }}>Operators scan QR codes, manage roll call, and communicate with parents in real time.</div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ width: "7vw", height: "7vw", borderRadius: "50%", background: "#FBBF24", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2.5vh" }}>
            <span style={{ fontSize: "3.5vw", fontWeight: 900, color: "#1E3A8A" }}>4</span>
          </div>
          <div style={{ fontSize: "1.9vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>Insights & growth</div>
          <div style={{ fontSize: "1.4vw", color: "#64748B", lineHeight: 1.6 }}>Admin tracks revenue, fills waitlists, and uses AI-assisted roster planning to grow.</div>
        </div>
      </div>

      {/* Connecting lines between steps */}
      <div className="absolute" style={{ top: "46.5vh", left: "calc(7vw + 7vw + 2vw)", right: "calc(7vw + 7vw + 2vw)", height: "0.3vh", background: "linear-gradient(90deg, #1E3A8A, #FBBF24)" }} />
    </div>
  );
}
