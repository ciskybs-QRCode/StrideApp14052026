import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene6() {
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
      className="absolute inset-0 bg-[#0A192F] flex items-center justify-center"
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
      style={{ perspective: "1000px" }}
    >
      <div className="flex w-full px-24 gap-16 items-center">
        <motion.div 
          className="flex-1"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-[4vw] font-bold text-white mb-6">Digital Contracts</h2>
          <p className="text-[1.8vw] text-white/60 mb-8">
            SHA-256 Audit Trails.<br/>Bulletproof compliance.
          </p>
          <motion.div
            className="w-full h-1 bg-[#1E3A8A] rounded-full overflow-hidden"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          >
            <motion.div 
              className="h-full bg-[#FBBF24]"
              initial={{ width: "0%" }}
              animate={phase >= 3 ? { width: "100%" } : { width: "0%" }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>

        <motion.div 
          className="w-[35vw] h-[45vh] bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col relative overflow-hidden backdrop-blur-sm"
          initial={{ opacity: 0, x: 50 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
          transition={{ duration: 0.8, type: "spring" }}
        >
          <div className="w-3/4 h-4 bg-white/20 rounded mb-6" />
          <div className="w-full h-3 bg-white/10 rounded mb-3" />
          <div className="w-full h-3 bg-white/10 rounded mb-3" />
          <div className="w-5/6 h-3 bg-white/10 rounded mb-12" />

          <motion.div 
            className="mt-auto w-32 h-16 border-b-2 border-blue-400 self-end"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          >
            <motion.svg viewBox="0 0 100 50" className="w-full h-full text-blue-400 stroke-current" fill="none" strokeWidth="2">
              <motion.path 
                d="M10,40 Q30,10 50,30 T90,20" 
                initial={{ pathLength: 0 }}
                animate={phase >= 3 ? { pathLength: 1 } : { pathLength: 0 }}
                transition={{ duration: 1, ease: "easeInOut" }}
              />
            </motion.svg>
          </motion.div>

          <motion.div 
            className="absolute bottom-4 left-8 text-xs font-mono text-white/30"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 1 }}
          >
            HASH: 8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
