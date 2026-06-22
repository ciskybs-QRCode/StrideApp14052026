export default function Slide10Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#1E3A8A", fontFamily: "Montserrat, sans-serif" }}>

      {/* Background geometric */}
      <div className="absolute" style={{ top: "-20vh", right: "-15vw", width: "65vw", height: "65vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.12)" }} />
      <div className="absolute" style={{ top: "-10vh", right: "-8vw", width: "45vw", height: "45vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.07)" }} />
      <div className="absolute" style={{ bottom: "-20vh", left: "-10vw", width: "55vw", height: "55vw", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)" }} />

      {/* Gold top bar */}
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.5vh", background: "#FBBF24" }} />

      {/* Logo mark — top left */}
      <div className="absolute" style={{ top: "6vh", left: "7vw", display: "flex", alignItems: "center", gap: "1.2vw" }}>
        <div style={{ width: "4.5vw", height: "4.5vw", borderRadius: "1.2vw", background: "#FBBF24", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "2.4vw", fontWeight: 900, color: "#1E3A8A", lineHeight: 1 }}>S</span>
        </div>
        <span style={{ fontSize: "2.2vw", fontWeight: 800, color: "#fff", letterSpacing: "0.05em" }}>STRIDE</span>
      </div>

      {/* Centered main content */}
      <div className="absolute" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", width: "70vw" }}>
        <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "4vh" }}>
          READY TO GET STARTED?
        </div>
        <div style={{ fontSize: "7vw", fontWeight: 900, color: "#fff", lineHeight: 1.0, letterSpacing: "-0.03em", marginBottom: "4vh" }}>
          Run your association.
          <br />
          <span style={{ color: "#FBBF24" }}>Not your spreadsheets.</span>
        </div>
        <div style={{ width: "8vw", height: "0.5vh", background: "#FBBF24", margin: "0 auto 4vh" }} />
        <div style={{ fontSize: "2.2vw", color: "rgba(255,255,255,0.6)", fontWeight: 400, lineHeight: 1.5, marginBottom: "5vh" }}>
          Join the growing community of associations on Stride.
          <br />
          6 months free. No credit card required.
        </div>
        <div style={{ fontSize: "3vw", fontWeight: 800, color: "#FBBF24" }}>stride.app</div>
      </div>

      {/* Bottom: contact info */}
      <div className="absolute" style={{ bottom: "7vh", left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
        <div style={{ fontSize: "1.4vw", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>hello@stride.app</div>
      </div>
    </div>
  );
}
