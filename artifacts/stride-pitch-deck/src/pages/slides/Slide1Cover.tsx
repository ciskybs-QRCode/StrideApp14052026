const base = import.meta.env.BASE_URL;

export default function Slide1Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#1E3A8A", fontFamily: "Montserrat, sans-serif" }}>

      {/* Background geometric shapes */}
      <div className="absolute" style={{ top: "-15vh", right: "-10vw", width: "55vw", height: "55vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.12)" }} />
      <div className="absolute" style={{ top: "-8vh", right: "-4vw", width: "38vw", height: "38vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.08)" }} />
      <div className="absolute" style={{ bottom: "-12vh", left: "-8vw", width: "45vw", height: "45vw", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)" }} />

      {/* Gold top bar */}
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.5vh", background: "#FBBF24" }} />

      {/* Logo mark — top left */}
      <div className="absolute" style={{ top: "6vh", left: "7vw", display: "flex", alignItems: "center", gap: "1.2vw" }}>
        <div style={{ width: "4.5vw", height: "4.5vw", borderRadius: "1.2vw", background: "#FBBF24", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "2.4vw", fontWeight: 900, color: "#1E3A8A", lineHeight: 1 }}>S</span>
        </div>
        <span style={{ fontSize: "2.2vw", fontWeight: 800, color: "#fff", letterSpacing: "0.05em" }}>STRIDE</span>
      </div>

      {/* Confidential badge — top right */}
      <div className="absolute" style={{ top: "6.5vh", right: "7vw", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "2vw", padding: "0.6vh 1.6vw" }}>
        <span style={{ fontSize: "1.4vw", color: "rgba(255,255,255,0.5)", fontWeight: 600, letterSpacing: "0.1em" }}>CONFIDENTIAL</span>
      </div>

      {/* Main content — left aligned, vertically centered */}
      <div className="absolute" style={{ top: "50%", transform: "translateY(-50%)", left: "7vw", maxWidth: "58vw" }}>
        <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "3.5vh" }}>
          ASSOCIATION MANAGEMENT PLATFORM
        </div>
        <div style={{ fontSize: "7.5vw", fontWeight: 900, color: "#fff", lineHeight: 1.0, letterSpacing: "-0.03em", marginBottom: "4vh", textWrap: "balance" }}>
          Built for associations.
        </div>
        <div style={{ width: "8vw", height: "0.5vh", background: "#FBBF24", marginBottom: "4vh" }} />
        <div style={{ fontSize: "2.4vw", color: "rgba(255,255,255,0.65)", fontWeight: 400, lineHeight: 1.5, maxWidth: "46vw" }}>
          Attendance, payments, communications, and analytics — in one platform built specifically for associations.
        </div>
      </div>

      {/* Three role pills — bottom left */}
      <div className="absolute" style={{ bottom: "8vh", left: "7vw", display: "flex", gap: "1.2vw" }}>
        <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "3vw", padding: "1.2vh 2.2vw" }}>
          <span style={{ fontSize: "1.5vw", color: "#fff", fontWeight: 600 }}>Parents</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "3vw", padding: "1.2vh 2.2vw" }}>
          <span style={{ fontSize: "1.5vw", color: "#fff", fontWeight: 600 }}>Operators</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "3vw", padding: "1.2vh 2.2vw" }}>
          <span style={{ fontSize: "1.5vw", color: "#fff", fontWeight: 600 }}>Admins</span>
        </div>
      </div>

      {/* stride.app bottom right */}
      <div className="absolute" style={{ bottom: "8.5vh", right: "7vw" }}>
        <span style={{ fontSize: "1.8vw", color: "#FBBF24", fontWeight: 700 }}>stride.app</span>
      </div>
    </div>
  );
}
