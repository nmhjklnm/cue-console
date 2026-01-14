import { useCallback, useEffect, useRef, useState } from "react";

export function useAudioNotification() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const onConfigUpdated = (evt: Event) => {
      const e = evt as CustomEvent<{ sound_enabled?: boolean }>;
      if (typeof e.detail?.sound_enabled === "boolean") {
        setSoundEnabled(e.detail.sound_enabled);
      }
    };
    window.addEventListener("cue-console:configUpdated", onConfigUpdated);
    return () => window.removeEventListener("cue-console:configUpdated", onConfigUpdated);
  }, []);

  const playDing = useCallback(async () => {
    try {
      const Ctx = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtxRef.current || new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;

      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // ignore (autoplay policy, etc.)
    }
  }, []);

  return {
    soundEnabled,
    setSoundEnabled,
    playDing,
  };
}
