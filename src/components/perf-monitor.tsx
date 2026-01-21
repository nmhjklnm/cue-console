"use client";

import { useEffect, useState, useRef } from "react";

export function PerfMonitor() {
  const [fps, setFps] = useState(60);
  const renderCountRef = useRef(0);
  
  // Increment render count on every render
  renderCountRef.current++;

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;

    const measureFrame = () => {
      const now = performance.now();
      const delta = now - lastTime;
      
      if (delta >= 1000) {
        setFps(Math.round((frameCount * 1000) / delta));
        frameCount = 0;
        lastTime = now;
      }
      
      frameCount++;
      rafId = requestAnimationFrame(measureFrame);
    };

    rafId = requestAnimationFrame(measureFrame);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-black/80 px-3 py-2 text-xs text-white font-mono">
      <div>FPS: <span className={fps < 30 ? 'text-red-400' : fps < 50 ? 'text-yellow-400' : 'text-green-400'}>{fps}</span></div>
      <div>Renders: {renderCountRef.current}</div>
    </div>
  );
}
