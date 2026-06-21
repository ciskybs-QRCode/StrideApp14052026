import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#0F172A]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Sticky notes */}
      <motion.div
        className="absolute w-[15vw] h-[15vw] bg-yellow-200 shadow-xl"
        initial={{ rotate: -10, x: '-30vw', y: '-20vh', opacity: 0 }}
        animate={phase >= 1 ? { x: '-15vw', y: '-10vh', opacity: 1, rotate: -5 } : {}}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      />
      <motion.div
        className="absolute w-[12vw] h-[12vw] bg-pink-200 shadow-xl"
        initial={{ rotate: 15, x: '20vw', y: '10vh', opacity: 0 }}
        animate={phase >= 1 ? { x: '10vw', y: '5vh', opacity: 1, rotate: 20 } : {}}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
      />

      {/* WhatsApp Bubbles */}
      {phase >= 2 && (
        <>
          <motion.div
            className="absolute px-6 py-4 bg-green-500 rounded-2xl rounded-tl-none text-white text-[1.5vw] font-medium shadow-lg"
            initial={{ scale: 0, x: '-20vw', y: '15vh' }}
            animate={{ scale: 1, x: '-10vw', y: '15vh' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            "Is the 5pm class still on?"
          </motion.div>
          <motion.div
            className="absolute px-6 py-4 bg-gray-100 text-gray-800 rounded-2xl rounded-tr-none text-[1.5vw] font-medium shadow-lg"
            initial={{ scale: 0, x: '20vw', y: '-15vh' }}
            animate={{ scale: 1, x: '5vw', y: '-10vh' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.2 }}
          >
            "Can I pay later?"
          </motion.div>
        </>
      )}

      {/* Spreadsheet Grid Shatter */}
      {phase >= 3 && (
        <motion.div
          className="absolute inset-0 grid grid-cols-6 grid-rows-6 gap-1 p-8 z-10"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 4 ? { opacity: 0, scale: 1.5, filter: 'blur(10px)' } : { opacity: 0.5, scale: 1 }}
          transition={{ duration: phase >= 4 ? 0.8 : 0.4 }}
        >
          {Array.from({ length: 36 }).map((_, i) => (
            <motion.div
              key={i}
              className="bg-white/10 border border-white/20"
              animate={phase >= 4 ? {
                x: (Math.random() - 0.5) * 500,
                y: (Math.random() - 0.5) * 500,
                rotate: (Math.random() - 0.5) * 180,
                opacity: 0
              } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          ))}
        </motion.div>
      )}

      {/* Hero Text */}
      <motion.div className="z-20 text-center px-[10vw]">
        <motion.h1
          className="text-[4.5vw] font-bold text-white leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          Managing a dance school<br />
          <span className="text-red-400">shouldn't feel like this.</span>
        </motion.h1>
      </motion.div>
    </motion.div>
  );
}
