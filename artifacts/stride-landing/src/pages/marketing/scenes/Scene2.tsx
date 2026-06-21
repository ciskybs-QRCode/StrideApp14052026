import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#1E3A8A' }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.8 }}
    >
      {/* Crack reveal effect */}
      <motion.div
        className="absolute inset-0 bg-[#0F172A] z-20"
        initial={{ opacity: 1 }}
        animate={phase >= 1 ? { opacity: 0, scale: 1.2, filter: 'blur(20px)' } : { opacity: 1 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      <div className="z-10 text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.5 }}
          className="mb-8"
        >
          <img
            src={`${import.meta.env.BASE_URL}stride-logo.png`}
            alt="Stride"
            style={{
              height: '14vw',
              objectFit: 'contain',
              filter: 'brightness(0) invert(1) drop-shadow(0 0 40px rgba(251,191,36,0.6))',
            }}
          />
        </motion.div>

        <motion.div
          initial={{ width: 0 }}
          animate={phase >= 2 ? { width: '8vw' } : {}}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="h-[4px] bg-[#FBBF24] mb-8 origin-center"
        />

        <motion.h2
          className="text-[3vw] font-semibold text-white tracking-widest uppercase"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          Run your school.<br />
          <span className="text-[#FBBF24]">Not your spreadsheets.</span>
        </motion.h2>
      </div>

      {/* Animated accent lines */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-full h-[1px] bg-white/10"
          style={{ top: `${30 + i * 20}%` }}
          initial={{ scaleX: 0 }}
          animate={phase >= 1 ? { scaleX: 1 } : {}}
          transition={{ duration: 2, delay: i * 0.2, ease: 'easeOut' }}
        />
      ))}
    </motion.div>
  );
}
