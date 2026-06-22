export default function Slide2Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#F8FAFF", fontFamily: "Montserrat, sans-serif" }}>

      {/* Left navy accent column */}
      <div className="absolute left-0 top-0 bottom-0" style={{ width: "1vw", background: "#1E3A8A" }} />

      {/* Top content */}
      <div className="absolute" style={{ top: "7vh", left: "7vw", right: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "2vh" }}>THE PROBLEM</div>
        <div style={{ fontSize: "5.2vw", fontWeight: 900, color: "#1E3A8A", lineHeight: 1.05, letterSpacing: "-0.025em", marginBottom: "1.5vh" }}>
          Running an association is still manual.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24" }} />
      </div>

      {/* Four pain-point cards */}
      <div className="absolute" style={{ top: "32vh", left: "7vw", right: "7vw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2vw" }}>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 2.2vw", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "3.5vw", marginBottom: "2vh", lineHeight: 1 }}>—</div>
          <div style={{ fontSize: "2vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>WhatsApp chaos</div>
          <div style={{ fontSize: "1.6vw", color: "#64748B", lineHeight: 1.5, fontWeight: 400 }}>Parents texting at all hours. No record. No accountability.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 2.2vw", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "3.5vw", marginBottom: "2vh", lineHeight: 1 }}>—</div>
          <div style={{ fontSize: "2vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>Spreadsheet overload</div>
          <div style={{ fontSize: "1.6vw", color: "#64748B", lineHeight: 1.5, fontWeight: 400 }}>Attendance, payments, and rosters split across three files.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 2.2vw", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "3.5vw", marginBottom: "2vh", lineHeight: 1 }}>—</div>
          <div style={{ fontSize: "2vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>Paper everything</div>
          <div style={{ fontSize: "1.6vw", color: "#64748B", lineHeight: 1.5, fontWeight: 400 }}>Consent forms, medical certs, contracts. Lost in a folder.</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: "1.5vw", padding: "3.5vh 2.2vw", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: "3.5vw", marginBottom: "2vh", lineHeight: 1 }}>—</div>
          <div style={{ fontSize: "2vw", fontWeight: 800, color: "#1E3A8A", marginBottom: "1.5vh", lineHeight: 1.2 }}>Zero visibility</div>
          <div style={{ fontSize: "1.6vw", color: "#64748B", lineHeight: 1.5, fontWeight: 400 }}>No idea which courses are full, who hasn't paid, or what's trending.</div>
        </div>
      </div>

      {/* Bottom quote */}
      <div className="absolute" style={{ bottom: "7vh", left: "7vw", right: "7vw", borderLeft: "0.4vw solid #FBBF24", paddingLeft: "2vw" }}>
        <div style={{ fontSize: "2.2vw", fontWeight: 700, color: "#1E3A8A", lineHeight: 1.4 }}>
          "We were managing 120 members across 6 courses — entirely by hand."
        </div>
        <div style={{ fontSize: "1.4vw", color: "#64748B", marginTop: "1vh", fontWeight: 500 }}>Association Director</div>
      </div>
    </div>
  );
}
