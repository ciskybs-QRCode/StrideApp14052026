export default function Slide6Stats() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#1E3A8A", fontFamily: "Montserrat, sans-serif" }}>

      {/* Geometric accents */}
      <div className="absolute" style={{ top: "-20vh", right: "-15vw", width: "65vw", height: "65vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.1)" }} />
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.5vh", background: "#FBBF24" }} />

      {/* Label */}
      <div className="absolute" style={{ top: "7vh", left: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em" }}>MARKET OPPORTUNITY</div>
      </div>

      {/* Left: big statement */}
      <div className="absolute" style={{ top: "50%", transform: "translateY(-50%)", left: "7vw", width: "40vw" }}>
        <div style={{ fontSize: "5.5vw", fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: "3vh" }}>
          A large market with no clear winner.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24", marginBottom: "3vh" }} />
        <div style={{ fontSize: "1.9vw", color: "rgba(255,255,255,0.6)", fontWeight: 400, lineHeight: 1.6 }}>
          Tens of thousands of independent associations across Europe manage their operations with no purpose-built software. Stride is the first platform built specifically for this vertical.
        </div>
      </div>

      {/* Right: stat blocks */}
      <div className="absolute" style={{ top: "50%", transform: "translateY(-50%)", right: "7vw", width: "38vw", display: "flex", flexDirection: "column", gap: "3vh" }}>

        <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "1.5vw", padding: "3vh 3vw" }}>
          <div style={{ fontSize: "8vw", fontWeight: 900, color: "#FBBF24", lineHeight: 1 }}>40k+</div>
          <div style={{ fontSize: "1.7vw", color: "rgba(255,255,255,0.65)", fontWeight: 500, marginTop: "0.8vh" }}>Independent associations in Europe</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "1.5vw", padding: "3vh 3vw" }}>
          <div style={{ fontSize: "8vw", fontWeight: 900, color: "#fff", lineHeight: 1 }}>0</div>
          <div style={{ fontSize: "1.7vw", color: "rgba(255,255,255,0.65)", fontWeight: 500, marginTop: "0.8vh" }}>Purpose-built competitors in this vertical</div>
        </div>
      </div>
    </div>
  );
}
