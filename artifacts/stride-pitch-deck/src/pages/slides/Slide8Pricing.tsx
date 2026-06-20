export default function Slide8Pricing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#1E3A8A", fontFamily: "Montserrat, sans-serif" }}>

      {/* Background circles */}
      <div className="absolute" style={{ top: "-15vh", right: "-10vw", width: "55vw", height: "55vw", borderRadius: "50%", border: "1px solid rgba(251,191,36,0.1)" }} />
      <div className="absolute" style={{ bottom: "-15vh", left: "-5vw", width: "40vw", height: "40vw", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)" }} />
      <div className="absolute top-0 left-0 right-0" style={{ height: "0.5vh", background: "#FBBF24" }} />

      {/* Header */}
      <div className="absolute" style={{ top: "7vh", left: "7vw", right: "7vw" }}>
        <div style={{ fontSize: "1.3vw", fontWeight: 700, color: "#FBBF24", letterSpacing: "0.2em", marginBottom: "1.8vh" }}>BUSINESS MODEL</div>
        <div style={{ fontSize: "5vw", fontWeight: 900, color: "#fff", letterSpacing: "-0.025em", lineHeight: 1.05, marginBottom: "1.5vh" }}>
          SaaS subscription. Simple tiers.
        </div>
        <div style={{ width: "6vw", height: "0.4vh", background: "#FBBF24" }} />
      </div>

      {/* Three pricing cards */}
      <div className="absolute" style={{ top: "32vh", left: "7vw", right: "7vw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5vw" }}>

        {/* Core */}
        <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "1.5vw", padding: "4vh 3vw" }}>
          <div style={{ fontSize: "1.8vw", fontWeight: 800, color: "#FBBF24", marginBottom: "2.5vh" }}>Core</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5vw", marginBottom: "3vh" }}>
            <span style={{ fontSize: "6vw", fontWeight: 900, color: "#fff", lineHeight: 1 }}>€49</span>
            <span style={{ fontSize: "1.6vw", color: "rgba(255,255,255,0.5)" }}>/month</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Up to 100 members</span>
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>QR attendance</span>
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Online payments</span>
            </div>
          </div>
        </div>

        {/* Plus — featured */}
        <div style={{ background: "#fff", border: "2px solid #FBBF24", borderRadius: "1.5vw", padding: "4vh 3vw", position: "relative", boxShadow: "0 16px 48px rgba(0,0,0,0.3)" }}>
          <div className="absolute" style={{ top: "-2.2vh", left: "50%", transform: "translateX(-50%)", background: "#FBBF24", borderRadius: "2vw", padding: "0.7vh 2vw" }}>
            <span style={{ fontSize: "1.2vw", fontWeight: 700, color: "#1E3A8A" }}>MOST POPULAR</span>
          </div>
          <div style={{ fontSize: "1.8vw", fontWeight: 800, color: "#FBBF24", marginBottom: "2.5vh" }}>Plus</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5vw", marginBottom: "3vh" }}>
            <span style={{ fontSize: "6vw", fontWeight: 900, color: "#1E3A8A", lineHeight: 1 }}>€99</span>
            <span style={{ fontSize: "1.6vw", color: "#64748B" }}>/month</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500 }}>Up to 300 members</span>
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500 }}>AI roster optimizer</span>
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "#374151", fontWeight: 500 }}>Marketplace + multi-org</span>
            </div>
          </div>
        </div>

        {/* Premium */}
        <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "1.5vw", padding: "4vh 3vw" }}>
          <div style={{ fontSize: "1.8vw", fontWeight: 800, color: "#FBBF24", marginBottom: "2.5vh" }}>Premium</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5vw", marginBottom: "3vh" }}>
            <span style={{ fontSize: "6vw", fontWeight: 900, color: "#fff", lineHeight: 1 }}>€199</span>
            <span style={{ fontSize: "1.6vw", color: "rgba(255,255,255,0.5)" }}>/month</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Unlimited members</span>
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>White-label branding</span>
            </div>
            <div style={{ display: "flex", gap: "1vw" }}>
              <span style={{ color: "#FBBF24", fontSize: "1.5vw" }}>+</span>
              <span style={{ fontSize: "1.5vw", color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Dedicated support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trial note */}
      <div className="absolute" style={{ bottom: "7vh", left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
        <div style={{ fontSize: "1.6vw", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>All plans include a 6-month free trial. No credit card required.</div>
      </div>
    </div>
  );
}
