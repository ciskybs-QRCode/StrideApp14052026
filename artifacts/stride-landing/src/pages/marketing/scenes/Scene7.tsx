import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#0F172A' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      {/* Background sweep */}
      <motion.div
        className="absolute inset-0 bg-[#1E3A8A]"
        initial={{ x: '-100%' }}
        animate={{ x: '0%' }}
        transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
      />
      
      <motion.div
        className="absolute w-[200%] h-[20vh] bg-[#FBBF24]/20 -rotate-12"
        initial={{ y: '100vh' }}
        animate={{ y: '-50vh' }}
        transition={{ duration: 2, delay: 0.5, ease: 'linear' }}
      />

      <div className="z-10 text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : {}}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="mb-8 bg-white p-8 rounded-3xl shadow-2xl"
        >
          <img
            src={`${import.meta.env.BASE_URL}stride-logo.png`}
            alt="Stride"
            style={{ height: '8vw', objectFit: 'contain' }}
          />
        </motion.div>

        <motion.h2
          className="text-[2.5vw] font-bold text-white mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
        >
          Run your association. Not your spreadsheets.
        </motion.h2>

        <motion.div
          className="text-[2vw] font-medium text-[#FBBF24] border-2 border-[#FBBF24] px-8 py-3 rounded-full"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
        >
          stride.app
        </motion.div>
      </div>
    </motion.div>
  );
}
