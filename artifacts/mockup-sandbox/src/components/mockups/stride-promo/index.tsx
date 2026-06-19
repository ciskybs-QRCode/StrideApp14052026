import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './scenes/Scene1';
import { Scene2 } from './scenes/Scene2';
import { Scene3 } from './scenes/Scene3';
import { Scene4 } from './scenes/Scene4';
import { Scene5 } from './scenes/Scene5';
import { Scene6 } from './scenes/Scene6';
import { Scene7 } from './scenes/Scene7';

const SCENE_DURATIONS = {
  intro: 6000,
  problem: 5000,
  solution: 5000,
  feature1: 6000,
  feature2: 7000,
  feature3: 6000,
  closing: 6000,
};

export default function StridePromoVideo() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0A192F] text-white font-sans flex items-center justify-center">
      {/* Persistent Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div 
          className="absolute inset-0 opacity-30 mix-blend-screen"
          style={{ background: 'radial-gradient(circle at center, #1E3A8A 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div 
          className="absolute -top-1/4 -right-1/4 w-[100vw] h-[100vw] rounded-full opacity-10 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #FBBF24, transparent)' }}
          animate={{ 
            x: ['-10%', '-20%', '-10%'], 
            y: ['10%', '0%', '10%'],
            scale: currentScene >= 2 ? 1.5 : 1
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="intro" />}
        {currentScene === 1 && <Scene2 key="problem" />}
        {currentScene === 2 && <Scene3 key="solution" />}
        {currentScene === 3 && <Scene4 key="feature1" />}
        {currentScene === 4 && <Scene5 key="feature2" />}
        {currentScene === 5 && <Scene6 key="feature3" />}
        {currentScene === 6 && <Scene7 key="closing" />}
      </AnimatePresence>
    </div>
  );
}
