import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 3800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0d1f4a 0%, #1E3A8A 100%)' }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60 }}
      transition={{ duration: 0.7 }}
    >
      {/* Left content */}
      <div className="relative z-10 flex flex-col justify-center px-[7vw] w-[55%] h-full">
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
            border: '1px solid rgba(251,191,36,0.35)',
            padding: '0.4vw 1.2vw',
            borderRadius: '100px',
            marginBottom: '2vw',
          }}
        >
          <span>🛡️</span> Smart Pick-Up
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 25 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: '3.4vw',
            color: '#ffffff',
            lineHeight: 1.2,
            marginBottom: '1.5vw',
          }}
        >
          Sicurezza dei minori.<br />
          <span style={{ color: '#FBBF24' }}>Zero compromessi.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.7 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 400,
            fontSize: '1.4vw',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.6,
            marginBottom: '2.5vw',
          }}
        >
          Ritiro autorizzato tramite QR univoco. Solo le persone approvate<br />
          dalla famiglia possono prelevare il minore — in tempo reale.
        </motion.p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vw' }}>
          {[
            'QR monouso a scadenza configurabile',
            'Override operatore con log immutabile',
            'Finestra temporale per il ritiro',
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: i * 0.12 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.8vw',
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 600,
                fontSize: '1.2vw',
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              <span style={{ color: '#FBBF24', fontSize: '1.4vw' }}>✓</span>
              {item}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right — QR mock */}
      <div className="relative z-10 flex items-center justify-center w-[45%] h-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: -4 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.8, rotate: -4 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: '2vw',
            padding: '2.5vw',
            backdropFilter: 'blur(12px)',
            minWidth: '22vw',
          }}
        >
          {/* QR code mock */}
          <div style={{
            width: '14vw',
            height: '14vw',
            background: 'white',
            borderRadius: '1vw',
            margin: '0 auto 1.5vw',
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '2px',
            padding: '1vw',
            overflow: 'hidden',
          }}>
            {[...Array(49)].map((_, i) => {
              const corner = [0,1,2,3,4,5,6,7,13,14,20,21,27,28,34,35,41,42,43,44,45,46,47,48];
              const fill = corner.includes(i) || ((i * 13 + 7) % 5) < 2;
              return (
                <div key={i} style={{ background: fill ? '#1E3A8A' : 'white', borderRadius: '1px' }} />
              );
            })}
          </div>

          {/* Status badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              textAlign: 'center',
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 700,
              fontSize: '1.1vw',
              color: '#4ade80',
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: '100px',
              padding: '0.4vw 1.2vw',
            }}
          >
            ✓ AUTORIZZATO — Mario Rossi
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
