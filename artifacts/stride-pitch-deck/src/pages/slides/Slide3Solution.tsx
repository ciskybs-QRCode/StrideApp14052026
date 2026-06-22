export default function Slide3Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#1E3A8A", fontFamily: "Montserrat, sans-serif" }}>

      {/* Background circles */}
      <div className="absolute" style={{ top: "-20vh", right: "-15vw", width: "60vw", height: "60vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.1)" }} />
      <div className="absolute" style={{ bottom: "-10vh", left: "-5vw", width: "35vw", height: "35vw", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)" }} />
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.5vh", background: "#FBBF24" }} />

      {/* Section label */}
      <div className="absolute" style={{ top: "7vh", left: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em" }}>THE SOLUTION</div>
      </div>

      {/* Left: big statement */}
      <div className="absolute" style={{ top: "50%", transform: "translateY(-50%)", left: "7vw", width: "42vw" }}>
        <div style={{ fontSize: "5.5vw", fontWeight: 900, color: "#fff", lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: "3.5vh" }}>
          Stride brings it all together.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24", marginBottom: "3.5vh" }} />
        <div style={{ fontSize: "2vw", color: "rgba(255,255,255,0.65)", fontWeight: 400, lineHeight: 1.6 }}>
          One platform that replaces the spreadsheets, the group chats, the paper forms, and the guesswork — built for every role in the association.
        </div>
      </div>

      {/* Right: vertical feature list */}
      <div className="absolute" style={{ top: "50%", transform: "translateY(-50%)", right: "7vw", width: "38vw", display: "flex", flexDirection: "column", gap: "2.5vh" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "2vw", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.2vw", padding: "2.5vh 2vw" }}>
          <div style={{ width: "5vw", textAlign: "center", fontSize: "2.5vw", fontWeight: 900, color: "#FBBF24", flexShrink: 0 }}>01</div>
          <div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#fff", marginBottom: "0.5vh" }}>Attendance & check-in</div>
            <div style={{ fontSize: "1.4vw", color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>QR scanning + BLE proximity</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "2vw", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.2vw", padding: "2.5vh 2vw" }}>
          <div style={{ width: "5vw", textAlign: "center", fontSize: "2.5vw", fontWeight: 900, color: "#FBBF24", flexShrink: 0 }}>02</div>
          <div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#fff", marginBottom: "0.5vh" }}>Payments & invoicing</div>
            <div style={{ fontSize: "1.4vw", color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>Stripe-powered, multi-currency</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "2vw", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.2vw", padding: "2.5vh 2vw" }}>
          <div style={{ width: "5vw", textAlign: "center", fontSize: "2.5vw", fontWeight: 900, color: "#FBBF24", flexShrink: 0 }}>03</div>
          <div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#fff", marginBottom: "0.5vh" }}>Communications</div>
            <div style={{ fontSize: "1.4vw", color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>Broadcast, documents, emergency alerts</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "2vw", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1.2vw", padding: "2.5vh 2vw" }}>
          <div style={{ width: "5vw", textAlign: "center", fontSize: "2.5vw", fontWeight: 900, color: "#FBBF24", flexShrink: 0 }}>04</div>
          <div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#fff", marginBottom: "0.5vh" }}>Analytics & reports</div>
            <div style={{ fontSize: "1.4vw", color: "rgba(255,255,255,0.55)", fontWeight: 400 }}>Revenue, attendance, course performance</div>
          </div>
        </div>
      </div>
    </div>
  );
}
