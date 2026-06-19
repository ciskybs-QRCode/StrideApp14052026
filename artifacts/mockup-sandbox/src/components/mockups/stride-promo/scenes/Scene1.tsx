import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0d1f4a 0%, #1E3A8A 60%, #0d1f4a 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.9 }}
    >
      {/* Animated grid lines in background */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-full h-px bg-white"
            style={{ top: `${(i + 1) * 12.5}%` }}
            initial={{ scaleX: 0, transformOrigin: 'left' }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.5, delay: i * 0.08, ease: 'easeOut' }}
          />
        ))}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-full w-px bg-white"
            style={{ left: `${(i + 1) * 8.33}%` }}
            initial={{ scaleY: 0, transformOrigin: 'top' }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.5, delay: i * 0.06, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* Gold glow top-right */}
      <div
        className="absolute -top-32 -right-32 w-[40vw] h-[40vw] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)' }}
      />

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="mb-10"
      >
        <img
          src={`${import.meta.env.BASE_URL}stride-logo.png`}
          alt="Stride"
          style={{ height: '9vw', objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(251,191,36,0.4))' }}
        />
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 40 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: '4.2vw',
          color: '#ffffff',
          letterSpacing: '-0.02em',
          textAlign: 'center',
          lineHeight: 1.15,
        }}
      >
        La piattaforma per le<br />
        <span style={{ color: '#FBBF24' }}>Associazioni moderne.</span>
      </motion.h1>

      {/* Subline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1 }}
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 400,
          fontSize: '1.6vw',
          color: 'rgba(255,255,255,0.6)',
          marginTop: '2vw',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Gestione multi-sede · Iscrizioni · Presenze · Pagamenti · Contratti
      </motion.p>

      {/* Bottom gold bar progress */}
      <motion.div
        className="absolute bottom-0 left-0 h-[3px]"
        style={{ background: '#FBBF24' }}
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 7, ease: 'linear' }}
      />
    </motion.div>
  );
}
