import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const features = [
  'Gestione multi-sede',
  'Smart Pick-Up',
  'Emergency Pulse',
  'AI Orchestrator',
  'Contratti digitali',
  'Wallet & Pagamenti',
];

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 4200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0d1f4a 0%, #1E3A8A 50%, #0d1f4a 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      {/* Radial gold burst */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(251,191,36,0.12) 0%, transparent 60%)' }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Animated grid */}
      <div className="absolute inset-0 overflow-hidden opacity-[0.06]">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute w-full h-px bg-white" style={{ top: `${(i + 1) * 16.6}%` }} />
        ))}
        {[...Array(10)].map((_, i) => (
          <div key={i} className="absolute h-full w-px bg-white" style={{ left: `${(i + 1) * 10}%` }} />
        ))}
      </div>

      {/* Feature pills orbit */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {features.map((f, i) => {
          const angle = (i / features.length) * 2 * Math.PI - Math.PI / 2;
          const radius = 38;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={phase >= 2 ? { opacity: 0.5, scale: 1 } : { opacity: 0, scale: 0 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              style={{
                position: 'absolute',
                left: `calc(50% + ${x}vw)`,
                top: `calc(50% + ${y}vh)`,
                transform: 'translate(-50%, -50%)',
                fontFamily: "'Montserrat', sans-serif",
                fontWeight: 600,
                fontSize: '0.9vw',
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '100px',
                padding: '0.3vw 0.9vw',
                whiteSpace: 'nowrap',
              }}
            >
              {f}
            </motion.div>
          );
        })}
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.7, y: 20 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          style={{ marginBottom: '2vw' }}
        >
          <img
            src={`${import.meta.env.BASE_URL}stride-logo.png`}
            alt="Stride"
            style={{
              height: '10vw',
              objectFit: 'contain',
              filter: 'brightness(0) invert(1) drop-shadow(0 0 24px rgba(251,191,36,0.45))',
            }}
          />
        </motion.div>

        {/* Gold divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={phase >= 2 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            width: '6vw',
            height: '3px',
            background: '#FBBF24',
            transformOrigin: 'center',
            marginBottom: '1.8vw',
          }}
        />

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={phase >= 2 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(8px)' }}
          transition={{ duration: 1 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: '2.4vw',
            color: '#FBBF24',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '3vw',
          }}
        >
          Every Move. Managed.
        </motion.p>

        {/* Domain pill */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 150, damping: 15 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: '1.6vw',
            color: 'white',
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '100px',
            padding: '0.7vw 2.5vw',
            marginBottom: '2vw',
            letterSpacing: '0.04em',
          }}
        >
          stride-ops.com
        </motion.div>

        {/* CTA */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
          style={{
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 500,
            fontSize: '1.1vw',
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          La piattaforma italiana per le Associazioni.
        </motion.p>
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
