import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[10vw] overflow-hidden"
      style={{ background: '#0F172A' }}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/4 w-[40vw] h-[40vw] bg-[#1E3A8A] rounded-full blur-[100px] opacity-40 transform -translate-y-1/2" />

      {/* Left Text */}
      <div className="z-10 w-[40%]">
        <motion.h2
          className="text-[4vw] font-bold text-white leading-tight mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          Parents stay informed.<br />
          <span className="text-[#FBBF24]">Always.</span>
        </motion.h2>
        <motion.p
          className="text-[1.5vw] text-white/70"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : {}}
          transition={{ duration: 0.8 }}
        >
          Schedules, payments, and events right in their pocket.
        </motion.p>
      </div>

      {/* Right Phone Mockup */}
      <div className="z-10 w-[40%] relative h-[80vh] flex items-center justify-center">
        <motion.div
          className="relative w-[22vw] h-[45vw] bg-white rounded-[3vw] border-[8px] border-gray-800 shadow-2xl overflow-hidden"
          initial={{ opacity: 0, y: 100, rotate: 10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0, rotate: 0 } : {}}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          {/* Phone Header */}
          <div className="h-[15%] bg-[#1E3A8A] p-6 text-white flex flex-col justify-end">
            <div className="text-[1.2vw] font-medium opacity-80">Welcome back</div>
            <div className="text-[1.8vw] font-bold">Emma Conti</div>
          </div>

          {/* Phone Content */}
          <div className="p-6 bg-gray-50 h-full">
            {/* Course Card */}
            <motion.div
              className="bg-white p-5 rounded-2xl shadow-sm mb-4 border-l-4 border-[#1E3A8A]"
              initial={{ opacity: 0, x: 50 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : {}}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <div className="text-[1.4vw] font-bold text-gray-800">Ballet Baby</div>
              <div className="text-[1vw] text-gray-500">Today, 16:00 - Room A</div>
            </motion.div>

            {/* Event Card */}
            <motion.div
              className="bg-[#FBBF24] p-5 rounded-2xl shadow-sm text-gray-900"
              initial={{ opacity: 0, y: 50 }}
              animate={phase >= 4 ? { opacity: 1, y: 0 } : {}}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            >
              <div className="text-[1.2vw] font-semibold mb-1">Upcoming Event</div>
              <div className="text-[1.6vw] font-bold">End of Year Show</div>
              <div className="text-[1vw] mt-2 opacity-80">June 15th · Main Theater</div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
