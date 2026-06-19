import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const problems = [
  { icon: '📋', text: 'Registri cartacei smarriti' },
  { icon: '📞', text: 'Comunicazioni disperse' },
  { icon: '💸', text: 'Pagamenti non tracciati' },
  { icon: '📁', text: 'Documenti senza firma' },
];

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1700),
      setTimeout(() => setPhase(4), 2400),
      setTimeout(() => setPhase(5), 3100),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: '#0a0a0a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 0.7 }}
    >
      {/* Red vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(180,0,0,0.22) 100%)' }}
      />

      <div className="relative z-10 w-full px-[8vw] flex flex-col items-start">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: '1.1vw',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.4)',
            padding: '0.4vw 1.2vw',
            borderRadius: '100px',
            marginBottom: '2.5vw',
            display: 'inline-block',
          }}
        >
          Il problema
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 800,
            fontSize: '3.8vw',
            color: '#ffffff',
            lineHeight: 1.2,
            marginBottom: '3vw',
          }}
        >
          Gestire un'associazione<br />
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>non dovrebbe essere così.</span>
        </motion.h2>

        {/* Problem items */}
        <div className="flex flex-col gap-[1.2vw]">
          {problems.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -40 }}
              animate={phase >= i + 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1.2vw',
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 600,
                fontSize: '1.8vw',
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              <span style={{ fontSize: '2vw' }}>{p.icon}</span>
              <span style={{ textDecoration: 'line-through', textDecorationColor: '#ef4444' }}>{p.text}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div
        className="absolute bottom-0 left-0 h-[3px]"
        style={{ background: '#ef4444' }}
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 5.5, ease: 'linear' }}
      />
    </motion.div>
  );
}
