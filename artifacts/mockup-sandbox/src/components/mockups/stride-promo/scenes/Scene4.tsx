import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 bg-[#0A192F] flex items-center"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="w-1/2 h-full flex flex-col justify-center pl-24 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          className="w-16 h-1 bg-[#FBBF24] mb-8"
        />
        <motion.h2 
          className="text-[4vw] font-bold text-white leading-tight mb-6"
          initial={{ opacity: 0, x: -30 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
          transition={{ duration: 0.6 }}
        >
          Smart Pick-Up
        </motion.h2>
        <motion.p 
          className="text-[1.8vw] text-white/60 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          QR-based child safety.
          <br/>Cryptographic verification.
        </motion.p>
      </div>

      <div className="w-1/2 h-full relative">
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[30vw] border-[1px] border-[#FBBF24]/30 rounded-3xl"
          initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
          animate={phase >= 2 ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0.8, opacity: 0, rotate: -10 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="absolute inset-4 border border-[#FBBF24]/50 rounded-2xl flex items-center justify-center bg-[#1E3A8A]/40 backdrop-blur-sm">
            <div className="w-3/4 h-3/4 bg-white rounded-xl p-4 flex flex-col items-center justify-center gap-4">
               <div className="w-full h-1/2 bg-black/10 rounded border-2 border-dashed border-black/20 flex items-center justify-center">
                 <span className="text-black/30 font-bold text-2xl">QR</span>
               </div>
               <div className="w-full h-4 bg-green-500/20 rounded-full overflow-hidden">
                 <motion.div 
                   className="h-full bg-green-500"
                   initial={{ width: "0%" }}
                   animate={phase >= 3 ? { width: "100%" } : { width: "0%" }}
                   transition={{ duration: 0.5, delay: 0.5 }}
                 />
               </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
