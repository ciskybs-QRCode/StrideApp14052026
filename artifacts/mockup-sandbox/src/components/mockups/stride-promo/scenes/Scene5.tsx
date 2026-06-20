import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
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
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <motion.h2
        className="text-[3.5vw] font-bold text-white mb-12 text-center"
        initial={{ opacity: 0, y: -30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
      >
        Admins see the <span className="text-[#FBBF24]">whole picture.</span>
      </motion.h2>

      <div className="flex gap-8 w-full max-w-[80vw] justify-center">
        {/* Stat 1 */}
        <motion.div
          className="bg-[#1E3A8A]/40 border border-[#1E3A8A] p-8 rounded-3xl w-1/3 text-center"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ type: 'spring', delay: 0 }}
        >
          <div className="text-[1.5vw] text-white/70 mb-2">Active Students</div>
          <motion.div
            className="text-[4vw] font-black text-white"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : {}}
          >
            485
          </motion.div>
        </motion.div>

        {/* Stat 2 */}
        <motion.div
          className="bg-[#1E3A8A]/40 border border-[#1E3A8A] p-8 rounded-3xl w-1/3 text-center"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ type: 'spring', delay: 0.2 }}
        >
          <div className="text-[1.5vw] text-white/70 mb-2">Monthly Revenue</div>
          <motion.div
            className="text-[4vw] font-black text-[#4ade80]"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : {}}
          >
            €12,840
          </motion.div>
        </motion.div>

        {/* Stat 3 */}
        <motion.div
          className="bg-[#1E3A8A]/40 border border-[#1E3A8A] p-8 rounded-3xl w-1/3 text-center"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
          transition={{ type: 'spring', delay: 0.4 }}
        >
          <div className="text-[1.5vw] text-white/70 mb-2">Avg Attendance</div>
          <motion.div
            className="text-[4vw] font-black text-[#FBBF24]"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : {}}
          >
            87%
          </motion.div>
        </motion.div>
      </div>

      {/* Progress Bars */}
      <div className="w-full max-w-[60vw] mt-12 space-y-6">
        {['Ballet Basics', 'Hip Hop Adv', 'Contemporary'].map((course, i) => (
          <div key={course}>
            <div className="flex justify-between text-white mb-2 text-[1.2vw]">
              <span>{course}</span>
              <span>{85 - i * 10}%</span>
            </div>
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#FBBF24]"
                initial={{ width: 0 }}
                animate={phase >= 3 ? { width: `${85 - i * 10}%` } : {}}
                transition={{ duration: 1, delay: i * 0.2, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
