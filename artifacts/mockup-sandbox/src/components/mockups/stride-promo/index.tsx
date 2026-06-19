import React, { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './scenes/Scene1';
import { Scene2 } from './scenes/Scene2';
import { Scene3 } from './scenes/Scene3';
import { Scene4 } from './scenes/Scene4';
import { Scene5 } from './scenes/Scene5';
import { Scene6 } from './scenes/Scene6';
import { Scene7 } from './scenes/Scene7';

const SCENE_DURATIONS = {
  opening: 7000,
  problem: 5500,
  reveal: 5500,
  smartpickup: 6500,
  emergency: 7500,
  contracts: 6500,
  closing: 6500,
};

export default function StridePromoVideo() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap';
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
        background: '#0d1f4a',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="opening" />}
        {currentScene === 1 && <Scene2 key="problem" />}
        {currentScene === 2 && <Scene3 key="reveal" />}
        {currentScene === 3 && <Scene4 key="smartpickup" />}
        {currentScene === 4 && <Scene5 key="emergency" />}
        {currentScene === 5 && <Scene6 key="contracts" />}
        {currentScene === 6 && <Scene7 key="closing" />}
      </AnimatePresence>
    </div>
  );
}
