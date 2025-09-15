// Performance monitoring and optimization utilities
import { useCallback, useEffect, useRef } from 'react';

// Performance metrics interfaces
export interface PerformanceMetrics {
  renderTime: number;
  componentMountTime: number;
  rerenderCount: number;
  memoryUsage?: number;
  timestamp: number;
}

export interface WebVitalsMetrics {
  FCP: number; // First Contentful Paint
  LCP: number; // Largest Contentful Paint
  FID: number; // First Input Delay
  CLS: number; // Cumulative Layout Shift
  TTFB: number; // Time to First Byte
}

export interface PerformanceThresholds {
  renderTime: { warning: number; critical: number };
  memoryUsage: { warning: number; critical: number };
  componentCount: { warning: number; critical: number };
}

// Default performance thresholds
export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  renderTime: { warning: 16, critical: 50 }, // ms
  memoryUsage: { warning: 50 * 1024 * 1024, critical: 100 * 1024 * 1024 }, // bytes
  componentCount: { warning: 100, critical: 200 }
};

// Web vitals metric type for dynamic imports
interface WebVitalsCallback {
  (metric: { name: string; value: number; id: string }): void;
}

interface WebVitalsModule {
  getCLS: (callback: WebVitalsCallback) => void;
  getFID: (callback: WebVitalsCallback) => void;
  getFCP: (callback: WebVitalsCallback) => void;
  getLCP: (callback: WebVitalsCallback) => void;
  getTTFB: (callback: WebVitalsCallback) => void;
}

// Performance Monitor class
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetrics[]> = new Map();
  private thresholds: PerformanceThresholds;
  private observers: PerformanceObserver[] = [];

  constructor(thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS) {
    this.thresholds = thresholds;
    this.initializeObservers();
  }

  static getInstance(thresholds?: PerformanceThresholds): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor(thresholds);
    }
    return PerformanceMonitor.instance;
  }

  private initializeObservers() {
    // Only initialize in browser environment
    if (typeof window === 'undefined') return;

    try {
      // Performance Observer for navigation and resource timing
      const perfObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          this.handlePerformanceEntry(entry);
        });
      });
      
      perfObserver.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
      this.observers.push(perfObserver);
    } catch (error) {
      console.warn('PerformanceObserver not supported:', error);
    }
  }

  private handlePerformanceEntry(entry: PerformanceEntry) {
    const metrics: PerformanceMetrics = {
      renderTime: entry.duration,
      componentMountTime: entry.startTime,
      rerenderCount: 0,
      timestamp: Date.now()
    };

    if (entry.name.includes('component')) {
      const componentName = entry.name;
      const existingMetrics = this.metrics.get(componentName) || [];
      existingMetrics.push(metrics);
      
      // Keep only last 100 entries
      if (existingMetrics.length > 100) {
        existingMetrics.splice(0, existingMetrics.length - 100);
      }
      
      this.metrics.set(componentName, existingMetrics);
    }
  }

  // Start performance measurement
  startMeasurement(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`${name}-start`);
    }
  }

  // End performance measurement
  endMeasurement(name: string): number {
    if (typeof performance === 'undefined' || !performance.mark || !performance.measure) {
      return 0;
    }

    try {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name)[0];
      return measure?.duration || 0;
    } catch (error) {
      console.warn(`Performance measurement failed for ${name}:`, error);
      return 0;
    }
  }

  // Get metrics for a component
  getMetrics(componentName: string): PerformanceMetrics[] {
    return this.metrics.get(componentName) || [];
  }

  // Get aggregated metrics
  getAggregatedMetrics(componentName: string): {
    averageRenderTime: number;
    maxRenderTime: number;
    minRenderTime: number;
    totalRerenders: number;
  } {
    const metrics = this.getMetrics(componentName);
    if (metrics.length === 0) {
      return {
        averageRenderTime: 0,
        maxRenderTime: 0,
        minRenderTime: 0,
        totalRerenders: 0
      };
    }

    const renderTimes = metrics.map(m => m.renderTime);
    return {
      averageRenderTime: renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
      maxRenderTime: Math.max(...renderTimes),
      minRenderTime: Math.min(...renderTimes),
      totalRerenders: metrics.reduce((sum, m) => sum + m.rerenderCount, 0)
    };
  }

  // Check if metrics exceed thresholds
  checkThresholds(componentName: string): {
    renderTime: 'normal' | 'warning' | 'critical';
    memoryUsage: 'normal' | 'warning' | 'critical';
  } {
    const metrics = this.getAggregatedMetrics(componentName);
    
    let renderTimeStatus: 'normal' | 'warning' | 'critical' = 'normal';
    if (metrics.averageRenderTime > this.thresholds.renderTime.critical) {
      renderTimeStatus = 'critical';
    } else if (metrics.averageRenderTime > this.thresholds.renderTime.warning) {
      renderTimeStatus = 'warning';
    }

    // Memory usage check would need additional implementation
    const memoryUsageStatus: 'normal' | 'warning' | 'critical' = 'normal';

    return {
      renderTime: renderTimeStatus,
      memoryUsage: memoryUsageStatus
    };
  }

  // Clear metrics
  clearMetrics(componentName?: string): void {
    if (componentName) {
      this.metrics.delete(componentName);
    } else {
      this.metrics.clear();
    }
  }

  // Dispose of observers
  dispose(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics.clear();
  }
}

// Web Vitals Monitor class
export class WebVitalsMonitor {
  private static instance: WebVitalsMonitor;
  private vitals: Partial<WebVitalsMetrics> = {};
  private callbacks: Array<(vitals: Partial<WebVitalsMetrics>) => void> = [];

  static getInstance(): WebVitalsMonitor {
    if (!WebVitalsMonitor.instance) {
      WebVitalsMonitor.instance = new WebVitalsMonitor();
    }
    return WebVitalsMonitor.instance;
  }

  constructor() {
    this.initializeWebVitals();
  }

  private initializeWebVitals() {
    if (typeof window === 'undefined') return;

    // Try to import web-vitals dynamically if available
    this.loadWebVitals().catch(() => {
      // Fallback implementation using Performance API
      this.initializeFallbackVitals();
    });
  }

  private async loadWebVitals(): Promise<void> {
    try {
      // Dynamic import of web-vitals library - temporarily disabled for build
      // const webVitals = await import('web-vitals');
      
      // TODO: Re-enable web vitals monitoring after fixing type compatibility
      console.log('Web vitals monitoring temporarily disabled');
    } catch (error) {
      throw new Error('web-vitals library not available');
    }
  }

  private initializeFallbackVitals() {
    // Basic fallback using Performance API
    if (typeof performance === 'undefined') return;

    // TTFB fallback
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      this.vitals.TTFB = navEntry.responseStart - navEntry.fetchStart;
    }

    // FCP fallback
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    if (fcpEntry) {
      this.vitals.FCP = fcpEntry.startTime;
    }

    this.notifyCallbacks();
  }

  private notifyCallbacks() {
    this.callbacks.forEach(callback => callback(this.vitals));
  }

  // Subscribe to vitals updates
  onVitalsUpdate(callback: (vitals: Partial<WebVitalsMetrics>) => void): () => void {
    this.callbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  // Get current vitals
  getVitals(): Partial<WebVitalsMetrics> {
    return { ...this.vitals };
  }

  // Check if vitals are within acceptable ranges
  getVitalsStatus(): {
    FCP: 'good' | 'needs-improvement' | 'poor';
    LCP: 'good' | 'needs-improvement' | 'poor';
    FID: 'good' | 'needs-improvement' | 'poor';
    CLS: 'good' | 'needs-improvement' | 'poor';
    TTFB: 'good' | 'needs-improvement' | 'poor';
  } {
    return {
      FCP: this.vitals.FCP ? (this.vitals.FCP <= 1800 ? 'good' : this.vitals.FCP <= 3000 ? 'needs-improvement' : 'poor') : 'good',
      LCP: this.vitals.LCP ? (this.vitals.LCP <= 2500 ? 'good' : this.vitals.LCP <= 4000 ? 'needs-improvement' : 'poor') : 'good',
      FID: this.vitals.FID ? (this.vitals.FID <= 100 ? 'good' : this.vitals.FID <= 300 ? 'needs-improvement' : 'poor') : 'good',
      CLS: this.vitals.CLS ? (this.vitals.CLS <= 0.1 ? 'good' : this.vitals.CLS <= 0.25 ? 'needs-improvement' : 'poor') : 'good',
      TTFB: this.vitals.TTFB ? (this.vitals.TTFB <= 800 ? 'good' : this.vitals.TTFB <= 1800 ? 'needs-improvement' : 'poor') : 'good'
    };
  }
}

// React hook for performance monitoring
export function usePerformanceMonitor(componentName: string) {
  const monitor = useRef<PerformanceMonitor | null>(null);
  const renderCount = useRef(0);
  const startTime = useRef<number | null>(null);

  // Initialize monitor
  if (!monitor.current) {
    monitor.current = PerformanceMonitor.getInstance();
  }

  // Track component mounts and renders
  useEffect(() => {
    startTime.current = performance.now();
    monitor.current?.startMeasurement(`component-${componentName}`);
    renderCount.current++;

    return () => {
      if (startTime.current) {
        const duration = monitor.current?.endMeasurement(`component-${componentName}`) || 0;
        // Record metrics could be enhanced here
      }
    };
  });

  // Return performance utilities with proper typing
  return useCallback(() => ({
    startMeasurement: (name: string) => monitor.current?.startMeasurement(name),
    endMeasurement: (name: string) => monitor.current?.endMeasurement(name) || 0,
    getMetrics: () => monitor.current?.getMetrics(componentName) || [],
    getAggregatedMetrics: () => monitor.current?.getAggregatedMetrics(componentName),
    checkThresholds: () => monitor.current?.checkThresholds(componentName)
  }), [componentName]);
}

// React hook for web vitals
export function useWebVitals() {
  const monitor = useRef<WebVitalsMonitor | null>(null);
  
  if (!monitor.current) {
    monitor.current = WebVitalsMonitor.getInstance();
  }

  return {
    getVitals: () => monitor.current?.getVitals() || {},
    getVitalsStatus: () => monitor.current?.getVitalsStatus(),
    onVitalsUpdate: (callback: (vitals: Partial<WebVitalsMetrics>) => void) => 
      monitor.current?.onVitalsUpdate(callback) || (() => {})
  };
}

// Export default instances
export const performanceMonitor = PerformanceMonitor.getInstance();
export const webVitalsMonitor = WebVitalsMonitor.getInstance();