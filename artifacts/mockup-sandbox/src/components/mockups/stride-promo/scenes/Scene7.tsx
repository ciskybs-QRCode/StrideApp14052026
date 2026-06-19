import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 bg-[#1E3A8A] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={phase >= 1 ? { scale: 1, opacity: 0.15 } : { scale: 1.2, opacity: 0 }}
        transition={{ duration: 2, ease: "easeOut" }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/tech-gold.png`}
          className="w-full h-full object-cover mix-blend-screen"
          alt="Tech Background"
        />
      </motion.div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <motion.h1 
          className="text-[6vw] font-black text-white mb-4"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          STRIDE
        </motion.h1>

        <motion.p 
          className="text-[2.5vw] text-[#FBBF24] font-medium tracking-wide mb-12"
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 2 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 1 }}
        >
          Every move. Managed.
        </motion.p>

        <motion.div
          className="px-8 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
        >
          <span className="text-xl font-mono text-white/80">stride-ops.com</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
