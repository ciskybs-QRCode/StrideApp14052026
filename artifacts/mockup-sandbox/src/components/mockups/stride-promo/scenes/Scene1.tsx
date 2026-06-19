import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#0A192F]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/dance-intro.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-50"
        autoPlay
        muted
        playsInline
      />
      
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 50, filter: 'blur(10px)' }}
          animate={phase >= 1 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 50, filter: 'blur(10px)' }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <h1 className="text-[6vw] font-bold tracking-tight leading-none text-white">
            THE ART OF DANCE
          </h1>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="mt-6"
        >
          <p className="text-[2vw] text-[#FBBF24] uppercase tracking-[0.2em] font-medium">
            Meets the science of management
          </p>
        </motion.div>
      </div>

      <motion.div 
        className="absolute bottom-0 w-full h-1 bg-[#FBBF24]"
        initial={{ scaleX: 0, transformOrigin: "left" }}
        animate={phase >= 1 ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 5.5, ease: "linear" }}
      />
    </motion.div>
  );
}
