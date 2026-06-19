import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-black"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: "blur(20px)" }}
      transition={{ duration: 0.8 }}
    >
      <img
        src={`${import.meta.env.BASE_URL}images/chaos.png`}
        className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale"
        alt="Chaos"
      />
      
      <div className="absolute inset-0 bg-[#1E3A8A]/30 mix-blend-multiply" />

      <div className="relative z-10 w-full px-24 flex flex-col items-start justify-center h-full">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="bg-red-500/20 text-red-400 px-6 py-2 border border-red-500/30 backdrop-blur-md rounded-full text-xl font-medium tracking-wider uppercase mb-8"
        >
          The old way
        </motion.div>
        
        <div className="space-y-4">
          <motion.h2 
            className="text-[4vw] font-bold text-white leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          >
            Endless paperwork.
          </motion.h2>
          <motion.h2 
            className="text-[4vw] font-bold text-white/50 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          >
            Lost attendance.
          </motion.h2>
        </div>
      </div>
    </motion.div>
  );
}
