/**
 * Performance monitoring utility to track interval leaks and resource usage
 * Usage: Open browser console and run: localStorage.setItem('cue-console:perf-monitor', '1')
 */

interface IntervalStats {
  count: number;
  lastCheck: number;
}

class PerformanceMonitor {
  private originalSetInterval: typeof setInterval;
  private originalClearInterval: typeof clearInterval;
  private activeIntervals = new Map<number, { stack: string; created: number }>();
  private stats: IntervalStats = { count: 0, lastCheck: Date.now() };
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.originalSetInterval = window.setInterval.bind(window);
    this.originalClearInterval = window.clearInterval.bind(window);
  }

  start() {
    if (this.monitorInterval) return;

    // Intercept setInterval
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const stack = new Error().stack || '';
      const id = this.originalSetInterval(handler, timeout, ...args);
      this.activeIntervals.set(id as number, {
        stack,
        created: Date.now(),
      });
      return id;
    }) as typeof setInterval;

    // Intercept clearInterval
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) {
        this.activeIntervals.delete(id);
      }
      this.originalClearInterval(id);
    }) as typeof clearInterval;

    // Monitor every 10 seconds
    this.monitorInterval = this.originalSetInterval(() => {
      this.report();
    }, 10000);

    console.log('[PerfMonitor] Started tracking intervals');
  }

  stop() {
    if (!this.monitorInterval) return;

    // Restore original functions
    window.setInterval = this.originalSetInterval;
    window.clearInterval = this.originalClearInterval;

    this.originalClearInterval(this.monitorInterval);
    this.monitorInterval = null;

    console.log('[PerfMonitor] Stopped tracking intervals');
  }

  report() {
    const now = Date.now();
    const elapsed = (now - this.stats.lastCheck) / 1000;
    const currentCount = this.activeIntervals.size;
    const delta = currentCount - this.stats.count;

    console.group(`[PerfMonitor] Interval Report (${elapsed.toFixed(1)}s elapsed)`);
    console.log(`Active intervals: ${currentCount} (${delta >= 0 ? '+' : ''}${delta})`);

    if (delta > 0) {
      console.warn(`⚠️ Interval leak detected! ${delta} new intervals not cleaned up`);
      
      // Show recent intervals
      const recent = Array.from(this.activeIntervals.entries())
        .filter(([, info]) => now - info.created < 15000)
        .slice(0, 5);

      if (recent.length > 0) {
        console.log('Recent intervals (last 15s):');
        recent.forEach(([id, info]) => {
          const age = ((now - info.created) / 1000).toFixed(1);
          const location = info.stack.split('\n')[3]?.trim() || 'unknown';
          console.log(`  ID ${id} (${age}s ago): ${location}`);
        });
      }
    }

    // Memory info if available
    if ('memory' in performance && (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory) {
      const mem = (performance as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      const usedMB = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
      const totalMB = (mem.totalJSHeapSize / 1024 / 1024).toFixed(1);
      console.log(`Memory: ${usedMB}MB / ${totalMB}MB`);
    }

    console.groupEnd();

    this.stats = { count: currentCount, lastCheck: now };
  }

  getActiveCount(): number {
    return this.activeIntervals.size;
  }
}

// Singleton instance
let monitor: PerformanceMonitor | null = null;

export function startPerfMonitor() {
  if (!monitor) {
    monitor = new PerformanceMonitor();
  }
  monitor.start();
}

export function stopPerfMonitor() {
  if (monitor) {
    monitor.stop();
  }
}

export function getPerfMonitorStats() {
  return monitor ? { activeIntervals: monitor.getActiveCount() } : null;
}

// Auto-start if enabled in localStorage
if (typeof window !== 'undefined') {
  try {
    if (window.localStorage.getItem('cue-console:perf-monitor') === '1') {
      startPerfMonitor();
    }
  } catch {
    // ignore
  }
}
