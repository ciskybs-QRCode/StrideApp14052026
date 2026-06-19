import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const stats = [
  { label: 'Affidabilità docente', value: '94%', color: '#4ade80' },
  { label: 'Copertura automatica', value: '100%', color: '#FBBF24' },
  { label: 'Tempo risposta', value: '< 5 min', color: '#60a5fa' },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1300),
      setTimeout(() => setPhase(3), 2600),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      style={{ background: '#0a0a12' }}
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(16px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Animated pulse rings */}
      {phase >= 2 && (
        <>
          {[1, 1.8, 2.6].map((scale, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-red-500/20"
              style={{ width: '50vw', height: '50vw', right: '-8vw', top: '50%', marginTop: '-25vw' }}
              animate={{ scale: [scale, scale + 0.8], opacity: [0.4, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
            />
          ))}
        </>
      )}

      {/* Left */}
      <div className="relative z-10 flex flex-col justify-center px-[7vw] w-[58%] h-full">
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
            color: '#f87171',
            border: '1px solid rgba(248,113,113,0.3)',
            padding: '0.4vw 1.2vw',
            borderRadius: '100px',
            marginBottom: '2vw',
          }}
        >
          🚨 Emergency Pulse · AI Orchestrator
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
          Emergenza?<br />
          <span style={{ color: '#FBBF24' }}>L'associazione non si ferma.</span>
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
            marginBottom: '2.5vw',
          }}
        >
          Allerta push critica che bypassa il silenzioso. AI che ottimizza<br />
          la copertura docenti in 5 minuti. Cascata di sostituzione automatica.
        </motion.p>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '2vw' }}>
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '1vw',
                padding: '1vw 1.5vw',
                minWidth: '10vw',
              }}
            >
              <div style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 800,
                fontSize: '2.2vw',
                color: s.color,
                lineHeight: 1,
                marginBottom: '0.4vw',
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 500,
                fontSize: '0.9vw',
                color: 'rgba(255,255,255,0.45)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Right — SOS button */}
      <div className="relative z-10 flex items-center justify-center w-[42%] h-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Outer pulse */}
          <motion.div
            style={{
              position: 'absolute',
              width: '22vw',
              height: '22vw',
              borderRadius: '50%',
              border: '2px solid rgba(239,68,68,0.3)',
            }}
            animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            style={{
              position: 'absolute',
              width: '18vw',
              height: '18vw',
              borderRadius: '50%',
              border: '2px solid rgba(239,68,68,0.2)',
            }}
            animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
          />
          {/* SOS button */}
          <div style={{
            width: '14vw',
            height: '14vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #ef4444, #b91c1c)',
            boxShadow: '0 0 40px rgba(239,68,68,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ fontSize: '3vw', marginBottom: '0.3vw' }}>🚨</span>
            <span style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 900,
              fontSize: '2.5vw',
              color: 'white',
              letterSpacing: '0.1em',
            }}>SOS</span>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="absolute bottom-0 left-0 h-[3px]"
        style={{ background: '#ef4444' }}
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 7.5, ease: 'linear' }}
      />
    </motion.div>
  );
}
