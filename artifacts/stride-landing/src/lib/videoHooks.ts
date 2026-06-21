import { useState, useEffect, useRef } from 'react';

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const durationsRef = useRef(durations);
  const isFirstPass = useRef(true);

  useEffect(() => {
    const keys = Object.keys(durationsRef.current);
    if (keys.length === 0) return;
    const currentKey = keys[currentScene];
    const duration = durationsRef.current[currentKey];
    const timer = setTimeout(() => {
      if (currentScene < keys.length - 1) {
        setCurrentScene(currentScene + 1);
      } else {
        isFirstPass.current = false;
        setCurrentScene(0);
      }
    }, duration);
    return () => clearTimeout(timer);
  }, [currentScene]);

  return { currentScene };
}
