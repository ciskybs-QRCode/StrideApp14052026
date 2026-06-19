import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const docLines = [
  'Statuto dell\'Associazione ASD Palermo',
  'Consenso trattamento dati personali (GDPR)',
  'Liberatoria attività e copertura assicurativa',
  'Autorizzazione ritiro minorenni',
  'Regolamento interno associativo',
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2800),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0d1f4a 0%, #0a0a1a 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.8 }}
    >
      {/* Gold shimmer top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, #FBBF24, transparent)' }}
      />

      {/* Left */}
      <div className="relative z-10 flex flex-col justify-center px-[7vw] w-[50%] h-full">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.5 }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6vw',
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: '1vw',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#FBBF24',
            border: '1px solid rgba(251,191,36,0.3)',
            padding: '0.4vw 1.2vw',
            borderRadius: '100px',
            marginBottom: '2vw',
          }}
        >
          📄 Contratti Digitali
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: '3.2vw',
            color: '#ffffff',
            lineHeight: 1.2,
            marginBottom: '1.4vw',
          }}
        >
          Firma digitale.<br />
          <span style={{ color: '#FBBF24' }}>Audit trail SHA-256.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.7 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 400,
            fontSize: '1.35vw',
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.65,
            marginBottom: '2vw',
          }}
        >
          Ogni documento firmato è archiviato con hash crittografico,<br />
          IP, dispositivo e timestamp. Compliance totale, zero carta.
        </motion.p>

        {/* Hash display */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.85vw',
            color: 'rgba(251,191,36,0.5)',
            background: 'rgba(251,191,36,0.05)',
            border: '1px solid rgba(251,191,36,0.15)',
            borderRadius: '0.5vw',
            padding: '0.8vw 1.2vw',
            letterSpacing: '0.04em',
            wordBreak: 'break-all',
          }}
        >
          SHA-256: 8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4
        </motion.div>
      </div>

      {/* Right — document mock */}
      <div className="relative z-10 flex items-center justify-center w-[50%] h-full pr-[5vw]">
        <motion.div
          initial={{ opacity: 0, x: 40, rotate: 2 }}
          animate={phase >= 2 ? { opacity: 1, x: 0, rotate: 0 } : { opacity: 0, x: 40, rotate: 2 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '1.5vw',
            padding: '2.5vw',
            width: '32vw',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Doc header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1vw',
            marginBottom: '1.8vw',
            paddingBottom: '1.2vw',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              width: '2.5vw',
              height: '2.5vw',
              background: 'rgba(251,191,36,0.15)',
              border: '1px solid rgba(251,191,36,0.3)',
              borderRadius: '0.5vw',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2vw',
            }}>📋</div>
            <span style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: '1.1vw',
              color: 'rgba(255,255,255,0.8)',
            }}>Documenti in attesa di firma</span>
          </div>

          {/* Document items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7vw', marginBottom: '2vw' }}>
            {docLines.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: 10 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.8vw',
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 500,
                  fontSize: '1vw',
                  color: i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
                }}
              >
                <span style={{ color: i === 0 ? '#FBBF24' : 'rgba(255,255,255,0.2)', fontSize: '0.9vw' }}>
                  {i === 0 ? '✍️' : '○'}
                </span>
                {line}
              </motion.div>
            ))}
          </div>

          {/* Signature area */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: '1.2vw',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ position: 'relative', width: '12vw', height: '3vw' }}>
              <svg viewBox="0 0 120 40" style={{ width: '100%', height: '100%' }}>
                <motion.path
                  d="M5,30 Q20,5 35,25 T65,20 T95,28 T115,22"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={phase >= 4 ? { pathLength: 1 } : { pathLength: 0 }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '1px',
                background: 'rgba(255,255,255,0.15)',
              }} />
            </div>
            <div style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: '0.9vw',
              color: '#4ade80',
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: '100px',
              padding: '0.3vw 0.9vw',
            }}>
              ✓ Firmato
            </div>
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-0 left-0 h-[3px]"
        style={{ background: '#FBBF24' }}
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 6.5, ease: 'linear' }}
      />
    </motion.div>
  );
}
