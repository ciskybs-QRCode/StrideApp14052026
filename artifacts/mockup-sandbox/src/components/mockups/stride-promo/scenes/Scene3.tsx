import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#1E3A8A]"
      initial={{ opacity: 0, clipPath: "circle(0% at center)" }}
      animate={{ opacity: 1, clipPath: "circle(100% at center)" }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
    >
      <img
        src={`${import.meta.env.BASE_URL}images/tech-gold.png`}
        className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
        alt="Tech Background"
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="w-32 h-32 rounded-3xl bg-gradient-to-br from-[#FBBF24] to-[#B45309] shadow-2xl shadow-[#FBBF24]/20 flex items-center justify-center mb-8"
        >
          <div className="w-16 h-16 border-4 border-white rounded-full flex items-center justify-center">
            <div className="w-8 h-8 bg-white rounded-sm rotate-45" />
          </div>
        </motion.div>

        <motion.h1 
          className="text-[7vw] font-black text-white tracking-tighter"
          initial={{ opacity: 0, y: 40 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          STRIDE
        </motion.h1>

        <motion.p 
          className="text-[1.8vw] text-white/80 tracking-widest uppercase mt-4"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1, letterSpacing: "0.3em" } : { opacity: 0, letterSpacing: "0.1em" }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          Multi-Tenant Orchestration
        </motion.p>
      </div>
    </motion.div>
  );
}
