import { useEffect, useState } from 'react';

export function useFpsCounter() {
  const [fps, setFps] = useState<number>(0);

  useEffect(() => {
    let frameCount = 0;
    let lastFpsUpdateTime = performance.now();
    let animId: number;

    const fpsLoop = () => {
      frameCount++;
      const now = performance.now();
      if (now >= lastFpsUpdateTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsUpdateTime)));
        frameCount = 0;
        lastFpsUpdateTime = now;
      }
      animId = requestAnimationFrame(fpsLoop);
    };

    animId = requestAnimationFrame(fpsLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  return fps;
}
