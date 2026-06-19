import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
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
      className="absolute inset-0 bg-[#1E3A8A] flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 0.8 }}
    >
      <motion.div 
        className="absolute w-[80vw] h-[80vw] rounded-full bg-red-600/20 blur-[100px]"
        animate={phase >= 2 ? { scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] } : { scale: 1, opacity: 0 }}
        transition={{ duration: 2, repeat: Infinity }}
      />

      <motion.div
        className="relative z-10 text-center mb-12"
        initial={{ opacity: 0, y: -30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -30 }}
        transition={{ duration: 0.8 }}
      >
        <div className="inline-block bg-red-500/20 text-red-300 px-6 py-2 rounded-full text-xl font-bold tracking-widest border border-red-500/30 mb-6 uppercase">
          Emergency Pulse
        </div>
      </motion.div>

      <div className="relative z-10 w-full max-w-4xl px-12 flex items-center justify-between">
        <motion.div
          className="flex-1 text-left"
          initial={{ opacity: 0, x: -40 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          <h3 className="text-[3.5vw] font-bold text-white mb-4 leading-tight">
            Crisis alerts.
            <br/>Bypassing silent mode.
          </h3>
        </motion.div>

        <motion.div
          className="w-48 h-48 rounded-full border-4 border-red-500 flex items-center justify-center relative"
          initial={{ scale: 0, rotate: -90 }}
          animate={phase >= 3 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -90 }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
        >
          <motion.div 
            className="absolute inset-0 rounded-full border-4 border-red-500"
            animate={{ scale: [1, 1.5], opacity: [1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <svg className="w-20 h-20 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </motion.div>
      </div>
    </motion.div>
  );
}
