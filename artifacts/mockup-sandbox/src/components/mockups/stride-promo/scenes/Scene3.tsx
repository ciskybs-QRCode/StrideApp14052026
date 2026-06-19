import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#1E3A8A' }}
      initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Radial gold glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 60% 40%, rgba(251,191,36,0.14) 0%, transparent 65%)' }}
      />

      {/* Diagonal accent lines */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            width: '200%',
            height: '1px',
            background: 'rgba(251,191,36,0.12)',
            top: `${15 + i * 18}%`,
            left: '-50%',
            transform: 'rotate(-12deg)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + i * 0.1 }}
        />
      ))}

      {/* Logo large reveal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6, y: 30 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.6, y: 30 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="mb-[2vw]"
      >
        <img
          src={`${import.meta.env.BASE_URL}stride-logo.png`}
          alt="Stride"
          style={{
            height: '12vw',
            objectFit: 'contain',
            filter: 'brightness(0) invert(1) drop-shadow(0 0 30px rgba(251,191,36,0.5))',
          }}
        />
      </motion.div>

      {/* Gold divider */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={phase >= 2 ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{
          width: '8vw',
          height: '3px',
          background: '#FBBF24',
          transformOrigin: 'center',
          marginBottom: '1.8vw',
        }}
      />

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.8 }}
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 700,
          fontSize: '2.2vw',
          color: '#FBBF24',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Every Move. Managed.
      </motion.p>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1 }}
        style={{
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 400,
          fontSize: '1.4vw',
          color: 'rgba(255,255,255,0.55)',
          marginTop: '1.5vw',
          letterSpacing: '0.04em',
          textAlign: 'center',
          maxWidth: '50vw',
        }}
      >
        Un ecosistema completo per la gestione di associazioni multi-sede in Italia e in Europa.
      </motion.p>

      <motion.div
        className="absolute bottom-0 left-0 h-[3px]"
        style={{ background: '#FBBF24' }}
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 5.5, ease: 'linear' }}
      />
    </motion.div>
  );
}
