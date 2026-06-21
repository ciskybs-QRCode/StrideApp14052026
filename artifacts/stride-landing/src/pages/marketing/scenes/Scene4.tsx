import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-row-reverse items-center justify-between px-[10vw] overflow-hidden"
      style={{ background: '#1E3A8A' }}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background glow */}
      <div className="absolute top-1/2 right-1/4 w-[40vw] h-[40vw] bg-[#FBBF24] rounded-full blur-[120px] opacity-20 transform -translate-y-1/2" />

      {/* Right Text (now on left visually due to flex-row-reverse, wait actually lets keep text left, phone right) */}
      <div className="z-10 w-[40%] text-right">
        <motion.h2
          className="text-[4vw] font-bold text-white leading-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          Operators run every class<br />
          <span className="text-[#FBBF24]">with confidence.</span>
        </motion.h2>
        <motion.p
          className="text-[1.5vw] text-white/80"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : {}}
          transition={{ duration: 0.8 }}
        >
          Instant roll calls and QR scanning.
        </motion.p>
      </div>

      {/* Left Phone Mockup */}
      <div className="z-10 w-[40%] relative h-[80vh] flex items-center justify-center">
        <motion.div
          className="relative w-[22vw] h-[45vw] bg-gray-900 rounded-[3vw] border-[8px] border-gray-700 shadow-2xl overflow-hidden"
          initial={{ opacity: 0, rotateY: -90 }}
          animate={phase >= 1 ? { opacity: 1, rotateY: 0 } : {}}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          {/* Dashboard Header */}
          <div className="h-[20%] p-6 text-white flex flex-col justify-end border-b border-gray-800">
            <div className="text-[1.8vw] font-bold">Contemporary Adv.</div>
            <div className="text-[1vw] text-[#FBBF24]">18:00 - 19:30</div>
          </div>

          {/* Dashboard Content */}
          <div className="p-6">
            {/* QR Button */}
            <motion.div
              className="bg-[#1E3A8A] text-white p-4 rounded-xl flex items-center justify-center gap-3 mb-6"
              initial={{ scale: 0.9 }}
              animate={phase >= 3 ? { scale: [1, 1.05, 1], boxShadow: "0 0 20px rgba(251,191,36,0.5)" } : {}}
              transition={{ duration: 0.5, repeat: phase >= 3 ? Infinity : 0, repeatDelay: 2 }}
            >
              <div className="w-8 h-8 bg-white/20 rounded-md" />
              <span className="text-[1.4vw] font-semibold">Scan QR Ticket</span>
            </motion.div>

            {/* Roll Call */}
            <div className="space-y-3">
              <div className="text-[1vw] text-gray-400 font-semibold mb-2">ROLL CALL (24/25)</div>
              {['Sofia R.', 'Marco B.', 'Elena V.'].map((name, i) => (
                <motion.div
                  key={name}
                  className="flex justify-between items-center bg-gray-800 p-4 rounded-xl"
                  initial={{ opacity: 0, x: -20 }}
                  animate={phase >= 4 ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: i * 0.15 }}
                >
                  <span className="text-white text-[1.2vw]">{name}</span>
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
