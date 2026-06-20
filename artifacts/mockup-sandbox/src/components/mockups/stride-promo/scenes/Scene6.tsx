import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const features = [
  { icon: '📱', label: 'QR Scan' },
  { icon: '📡', label: 'BLE Proximity' },
  { icon: '🚨', label: 'Emergency Pulse' },
  { icon: '💳', label: 'Stripe Payments' },
  { icon: '📝', label: 'Legal Docs' },
  { icon: '🤖', label: 'AI Roster' },
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#1E3A8A' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.8 }}
    >
      <motion.h2
        className="text-[3.5vw] font-bold text-white text-center mb-20 z-20"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
      >
        Everything a dance school needs.<br />
        <span className="text-[#FBBF24] opacity-80 text-[2.5vw]">Nothing it doesn't.</span>
      </motion.h2>

      <div className="relative w-[30vw] h-[30vw] flex items-center justify-center z-10">
        {/* Central Phone representation */}
        <motion.div
          className="w-[12vw] h-[24vw] border-4 border-white/20 rounded-[2vw] bg-[#0F172A] flex items-center justify-center shadow-2xl"
          initial={{ scale: 0 }}
          animate={phase >= 1 ? { scale: 1 } : {}}
          transition={{ type: 'spring', bounce: 0.5 }}
        >
           <img
            src={`${import.meta.env.BASE_URL}stride-logo.png`}
            alt="Stride"
            style={{ width: '60%', opacity: 0.8, filter: 'brightness(0) invert(1)' }}
          />
        </motion.div>

        {/* Orbiting Icons */}
        {features.map((feat, i) => {
          const angle = (i * 360) / features.length;
          return (
            <motion.div
              key={feat.label}
              className="absolute w-[8vw] h-[8vw] bg-white rounded-full flex flex-col items-center justify-center shadow-xl text-center p-2"
              initial={{ opacity: 0, scale: 0, rotate: 0 }}
              animate={phase >= 2 ? {
                opacity: 1,
                scale: 1,
                rotate: 360,
                x: Math.cos((angle * Math.PI) / 180) * 350,
                y: Math.sin((angle * Math.PI) / 180) * 350,
              } : {}}
              transition={{
                rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                scale: { type: 'spring', bounce: 0.5, delay: i * 0.1 },
                opacity: { duration: 0.3, delay: i * 0.1 },
                x: { type: 'spring', bounce: 0.4, delay: i * 0.1 },
                y: { type: 'spring', bounce: 0.4, delay: i * 0.1 }
              }}
            >
              {/* Counter-rotate content to keep it upright */}
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="flex flex-col items-center"
              >
                <span className="text-[2.5vw] mb-1">{feat.icon}</span>
                <span className="text-[0.8vw] font-bold text-[#1E3A8A] leading-tight">{feat.label}</span>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
