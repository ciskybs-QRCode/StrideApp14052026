import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '../../lib/videoHooks';
import { Scene1 } from './scenes/Scene1';
import { Scene2 } from './scenes/Scene2';
import { Scene3 } from './scenes/Scene3';
import { Scene4 } from './scenes/Scene4';
import { Scene5 } from './scenes/Scene5';
import { Scene6 } from './scenes/Scene6';
import { Scene7 } from './scenes/Scene7';

const SCENE_DURATIONS = {
  chaos: 7000,
  reveal: 9000,
  parent: 12000,
  operator: 10000,
  admin: 10000,
  features: 7000,
  closing: 5000,
};

export default function PromoVideo() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#0B1120',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(30,58,138,0.4) 0%, transparent 60%)' }}
      />
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="chaos" />}
        {currentScene === 1 && <Scene2 key="reveal" />}
        {currentScene === 2 && <Scene3 key="parent" />}
        {currentScene === 3 && <Scene4 key="operator" />}
        {currentScene === 4 && <Scene5 key="admin" />}
        {currentScene === 5 && <Scene6 key="features" />}
        {currentScene === 6 && <Scene7 key="closing" />}
      </AnimatePresence>
    </div>
  );
}
