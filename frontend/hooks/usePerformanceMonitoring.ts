import { useState, useCallback, useEffect, useRef } from 'react';
// import { PerformanceMonitor, WebVitalsMonitor } from '../utils/performance';

// Performance tracking interfaces
export interface RenderMetrics {
  componentName: string;
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  lastRenderTime: number;
  slowRenders: number;
  criticalRenders: number;
}

export interface APIMetrics {
  endpoint: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageResponseTime: number;
  slowRequests: number;
  lastRequestTime?: number;
}

export interface MemoryMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercentage: number;
  trend: 'stable' | 'increasing' | 'decreasing';
  peakUsage: number;
}

export interface UserInteractionMetrics {
  clicks: number;
  keystrokes: number;
  scrolls: number;
  formSubmissions: number;
  navigationEvents: number;
  averageTaskDuration: number;
}

export interface WebVitalsMetrics {
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
}

export interface PerformanceAlert {
  id: string;
  type: 'render' | 'api' | 'memory' | 'webvital' | 'interaction';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
}

// Configuration interface
export interface PerformanceMonitoringConfig {
  enableRenderTracking?: boolean;
  enableAPITracking?: boolean;
  enableMemoryTracking?: boolean;
  enableWebVitalsTracking?: boolean;
  enableUserInteractionTracking?: boolean;
  alertThresholds?: {
    slowRender?: number;
    criticalRender?: number;
    slowAPI?: number;
    memoryWarning?: number;
    memoryCritical?: number;
    lcpThreshold?: number;
    fidThreshold?: number;
    clsThreshold?: number;
  };
  reportingInterval?: number;
  maxAlerts?: number;
  enableReporting?: boolean;
}

const DEFAULT_CONFIG: Required<PerformanceMonitoringConfig> = {
  enableRenderTracking: true,
  enableAPITracking: true,
  enableMemoryTracking: true,
  enableWebVitalsTracking: true,
  enableUserInteractionTracking: true,
  alertThresholds: {
    slowRender: 16, // 16ms for 60fps
    criticalRender: 33, // 33ms for 30fps
    slowAPI: 1000, // 1 second
    memoryWarning: 50 * 1024 * 1024, // 50MB
    memoryCritical: 100 * 1024 * 1024, // 100MB
    lcpThreshold: 2500, // 2.5 seconds
    fidThreshold: 100, // 100ms
    clsThreshold: 0.1 // 0.1 CLS score
  },
  reportingInterval: 30000, // 30 seconds
  maxAlerts: 50,
  enableReporting: true
};

/**
 * Comprehensive performance monitoring hook
 * Tracks render performance, API calls, memory usage, Web Vitals, and user interactions
 */
export function usePerformanceMonitoring(config: PerformanceMonitoringConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  // State management
  const [renderMetrics, setRenderMetrics] = useState<Map<string, RenderMetrics>>(new Map());
  const [apiMetrics, setAPIMetrics] = useState<Map<string, APIMetrics>>(new Map());
  const [memoryMetrics, setMemoryMetrics] = useState<MemoryMetrics | null>(null);
  const [webVitalsMetrics, setWebVitalsMetrics] = useState<WebVitalsMetrics>({});
  const [userInteractionMetrics, setUserInteractionMetrics] = useState<UserInteractionMetrics>({
    clicks: 0,
    keystrokes: 0,
    scrolls: 0,
    formSubmissions: 0,
    navigationEvents: 0,
    averageTaskDuration: 0
  });
  const [performanceAlerts, setPerformanceAlerts] = useState<PerformanceAlert[]>([]);
  
  // Refs for tracking
  const alertIdCounter = useRef<number>(0);
  const memoryHistory = useRef<number[]>([]);
  const interactionStartTime = useRef<number | null>(null);
  const taskDurations = useRef<number[]>([]);
  const reportingInterval = useRef<NodeJS.Timeout | null>(null);
  const webVitalsCleanup = useRef<Array<() => void>>([]);

  // Create performance alert
  const createAlert = useCallback((
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    value: number,
    threshold: number
  ) => {
    const alert: PerformanceAlert = {
      id: `alert-${++alertIdCounter.current}`,
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: new Date(),
      resolved: false
    };

    setPerformanceAlerts(prev => {
      const newAlerts = [alert, ...prev].slice(0, mergedConfig.maxAlerts);
      
      // Log critical alerts
      if (severity === 'critical') {
        console.error('🚨 Critical Performance Alert:', alert);
      } else if (severity === 'high') {
        console.warn('⚠️ Performance Warning:', alert);
      }
      
      return newAlerts;
    });

    return alert;
  }, [mergedConfig.maxAlerts]);

  // Render performance tracking
  const trackRender = useCallback((componentName: string, renderTime: number) => {
    if (!mergedConfig.enableRenderTracking) return;

    setRenderMetrics(prev => {
      const existing = prev.get(componentName) || {
        componentName,
        renderCount: 0,
        totalRenderTime: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        slowRenders: 0,
        criticalRenders: 0
      };

      const newMetric: RenderMetrics = {
        ...existing,
        renderCount: existing.renderCount + 1,
        totalRenderTime: existing.totalRenderTime + renderTime,
        averageRenderTime: (existing.totalRenderTime + renderTime) / (existing.renderCount + 1),
        lastRenderTime: renderTime,
        slowRenders: existing.slowRenders + (renderTime > (mergedConfig.alertThresholds?.slowRender || 16) ? 1 : 0),
        criticalRenders: existing.criticalRenders + (renderTime > (mergedConfig.alertThresholds?.criticalRender || 50) ? 1 : 0)
      };

      // Create alerts for slow renders
      const criticalThreshold = mergedConfig.alertThresholds?.criticalRender || 50;
      const slowThreshold = mergedConfig.alertThresholds?.slowRender || 16;
      
      if (renderTime > criticalThreshold) {
        createAlert(
          'render',
          'critical',
          `Critical render time in ${componentName}: ${renderTime.toFixed(2)}ms`,
          renderTime,
          criticalThreshold
        );
      } else if (renderTime > slowThreshold) {
        createAlert(
          'render',
          'medium',
          `Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`,
          renderTime,
          slowThreshold
        );
      }

      const newMap = new Map(prev);
      newMap.set(componentName, newMetric);
      return newMap;
    });
  }, [mergedConfig.enableRenderTracking, mergedConfig.alertThresholds, createAlert]);

  // API performance tracking
  const trackAPI = useCallback((endpoint: string, responseTime: number, success: boolean) => {
    if (!mergedConfig.enableAPITracking) return;

    setAPIMetrics(prev => {
      const existing = prev.get(endpoint) || {
        endpoint,
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        lastRequestTime: undefined
      };

      const newMetric: APIMetrics = {
        ...existing,
        requestCount: existing.requestCount + 1,
        successCount: existing.successCount + (success ? 1 : 0),
        errorCount: existing.errorCount + (success ? 0 : 1),
        averageResponseTime: (existing.averageResponseTime * existing.requestCount + responseTime) / (existing.requestCount + 1),
        slowRequests: existing.slowRequests + (responseTime > (mergedConfig.alertThresholds?.slowAPI || 1000) ? 1 : 0),
        lastRequestTime: Date.now()
      };

      // Create alerts for slow API calls
      const slowAPIThreshold = mergedConfig.alertThresholds?.slowAPI || 1000;
      if (responseTime > slowAPIThreshold) {
        createAlert(
          'api',
          'medium',
          `Slow API response from ${endpoint}: ${responseTime.toFixed(2)}ms`,
          responseTime,
          slowAPIThreshold
        );
      }

      const newMap = new Map(prev);
      newMap.set(endpoint, newMetric);
      return newMap;
    });
  }, [mergedConfig.enableAPITracking, mergedConfig.alertThresholds, createAlert]);

  // Memory tracking
  const trackMemory = useCallback(() => {
    if (!mergedConfig.enableMemoryTracking || typeof performance === 'undefined' || !('memory' in performance)) {
      return null;
    }

    const memoryInfo = (performance as any).memory;
    const current = memoryInfo.usedJSHeapSize;
    
    // Update history
    memoryHistory.current.push(current);
    if (memoryHistory.current.length > 60) { // Keep last 60 readings
      memoryHistory.current = memoryHistory.current.slice(-60);
    }

    // Calculate trend
    let trend: MemoryMetrics['trend'] = 'stable';
    if (memoryHistory.current.length >= 10) {
      const recent = memoryHistory.current.slice(-10);
      const older = memoryHistory.current.slice(-20, -10);
      const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
      const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
      
      if (recentAvg > olderAvg * 1.1) trend = 'increasing';
      else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';
    }

    const metrics: MemoryMetrics = {
      usedJSHeapSize: current,
      totalJSHeapSize: memoryInfo.totalJSHeapSize,
      jsHeapSizeLimit: memoryInfo.jsHeapSizeLimit,
      usagePercentage: (current / memoryInfo.jsHeapSizeLimit) * 100,
      trend,
      peakUsage: Math.max(...memoryHistory.current)
    };

    setMemoryMetrics(metrics);

    // Create alerts for high memory usage
    const memoryCriticalThreshold = mergedConfig.alertThresholds?.memoryCritical || 100 * 1024 * 1024;
    const memoryWarningThreshold = mergedConfig.alertThresholds?.memoryWarning || 50 * 1024 * 1024;
    
    if (current > memoryCriticalThreshold) {
      createAlert(
        'memory',
        'critical',
        `Critical memory usage: ${(current / 1024 / 1024).toFixed(2)}MB`,
        current,
        memoryCriticalThreshold
      );
    } else if (current > memoryWarningThreshold) {
      createAlert(
        'memory',
        'medium',
        `High memory usage: ${(current / 1024 / 1024).toFixed(2)}MB`,
        current,
        memoryWarningThreshold
      );
    }

    return metrics;
  }, [mergedConfig.enableMemoryTracking, mergedConfig.alertThresholds, createAlert]);

  // User interaction tracking
  const trackInteraction = useCallback((type: keyof UserInteractionMetrics) => {
    if (!mergedConfig.enableUserInteractionTracking) return;

    if (type === 'clicks' || type === 'keystrokes' || type === 'scrolls' || type === 'formSubmissions' || type === 'navigationEvents') {
      setUserInteractionMetrics(prev => ({
        ...prev,
        [type]: prev[type] + 1
      }));
    }

    // Start task timing for certain interactions
    if (type === 'clicks' || type === 'formSubmissions') {
      interactionStartTime.current = performance.now();
    }
  }, [mergedConfig.enableUserInteractionTracking]);

  // End task timing
  const endTask = useCallback(() => {
    if (interactionStartTime.current) {
      const duration = performance.now() - interactionStartTime.current;
      taskDurations.current.push(duration);
      
      // Keep last 100 task durations
      if (taskDurations.current.length > 100) {
        taskDurations.current = taskDurations.current.slice(-100);
      }

      const averageTaskDuration = taskDurations.current.reduce((sum, d) => sum + d, 0) / taskDurations.current.length;
      
      setUserInteractionMetrics(prev => ({
        ...prev,
        averageTaskDuration
      }));

      interactionStartTime.current = null;
    }
  }, []);

  // Web Vitals tracking
  useEffect(() => {
    if (!mergedConfig.enableWebVitalsTracking) return;

    // const cleanupLCP = WebVitalsMonitor.measureLCP((value) => {
    //   setWebVitalsMetrics(prev => ({ ...prev, lcp: value }));
      
    //   if (value > mergedConfig.alertThresholds.lcpThreshold) {
    //     createAlert(
    //       'webvital',
    //       'medium',
    //       `Poor LCP: ${value.toFixed(2)}ms`,
    //       value,
    //       mergedConfig.alertThresholds.lcpThreshold
    //     );
    //   }
    // });

    // const cleanupFID = WebVitalsMonitor.measureFID((value) => {
    //   setWebVitalsMetrics(prev => ({ ...prev, fid: value }));
      
    //   if (value > mergedConfig.alertThresholds.fidThreshold) {
    //     createAlert(
    //       'webvital',
    //       'medium',
    //       `Poor FID: ${value.toFixed(2)}ms`,
    //       value,
    //       mergedConfig.alertThresholds.fidThreshold
    //     );
    //   }
    // });

    // const cleanupCLS = WebVitalsMonitor.measureCLS((value) => {
    //   setWebVitalsMetrics(prev => ({ ...prev, cls: value }));
      
    //   if (value > mergedConfig.alertThresholds.clsThreshold) {
    //     createAlert(
    //       'webvital',
    //       'medium',
    //       `Poor CLS: ${value.toFixed(4)}`,
    //       value,
    //       mergedConfig.alertThresholds.clsThreshold
    //     );
    //   }
    // });

    // webVitalsCleanup.current = [cleanupLCP, cleanupFID, cleanupCLS];

    return () => {
      webVitalsCleanup.current.forEach(cleanup => cleanup());
    };
  }, [mergedConfig.enableWebVitalsTracking, mergedConfig.alertThresholds, createAlert]);

  // User interaction event listeners
  useEffect(() => {
    if (!mergedConfig.enableUserInteractionTracking) return;

    const handleClick = () => trackInteraction('clicks');
    const handleKeydown = () => trackInteraction('keystrokes');
    const handleScroll = () => trackInteraction('scrolls');
    const handleSubmit = () => trackInteraction('formSubmissions');
    const handleNavigation = () => trackInteraction('navigationEvents');

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('scroll', handleScroll);
    document.addEventListener('submit', handleSubmit);
    window.addEventListener('popstate', handleNavigation);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('scroll', handleScroll);
      document.removeEventListener('submit', handleSubmit);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, [mergedConfig.enableUserInteractionTracking, trackInteraction]);

  // Memory monitoring interval
  useEffect(() => {
    if (!mergedConfig.enableMemoryTracking) return;

    const interval = setInterval(trackMemory, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [mergedConfig.enableMemoryTracking, trackMemory]);

  // Periodic reporting
  useEffect(() => {
    if (!mergedConfig.enableReporting) return;

    reportingInterval.current = setInterval(() => {
      const report = {
        timestamp: new Date(),
        renders: Object.fromEntries(renderMetrics),
        apis: Object.fromEntries(apiMetrics),
        memory: memoryMetrics,
        webVitals: webVitalsMetrics,
        interactions: userInteractionMetrics,
        alerts: performanceAlerts.filter(alert => !alert.resolved).length
      };

      console.log('📊 Performance Report:', report);

      // Send to analytics service in production
      if (import.meta.env.PROD && import.meta.env.VITE_ANALYTICS_ENDPOINT) {
        fetch(import.meta.env.VITE_ANALYTICS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'performance_report',
            ...report,
            url: window.location.href,
            userAgent: navigator.userAgent
          })
        }).catch(error => {
          console.warn('Failed to send performance report:', error);
        });
      }
    }, mergedConfig.reportingInterval);

    return () => {
      if (reportingInterval.current) {
        clearInterval(reportingInterval.current);
      }
    };
  }, [
    mergedConfig.enableReporting,
    mergedConfig.reportingInterval,
    renderMetrics,
    apiMetrics,
    memoryMetrics,
    webVitalsMetrics,
    userInteractionMetrics,
    performanceAlerts
  ]);

  // Resolve alert
  const resolveAlert = useCallback((alertId: string) => {
    setPerformanceAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId ? { ...alert, resolved: true } : alert
      )
    );
  }, []);

  // Clear resolved alerts
  const clearResolvedAlerts = useCallback(() => {
    setPerformanceAlerts(prev => prev.filter(alert => !alert.resolved));
  }, []);

  // Get performance summary
  const getPerformanceSummary = useCallback(() => {
    const renderStats = Array.from(renderMetrics.values());
    const apiStats = Array.from(apiMetrics.values());
    const activeAlerts = performanceAlerts.filter(alert => !alert.resolved);

    return {
      overall: {
        status: activeAlerts.some(a => a.severity === 'critical') 
          ? 'critical' 
          : activeAlerts.some(a => a.severity === 'high') 
            ? 'warning' 
            : 'good',
        score: Math.max(0, 100 - activeAlerts.length * 10)
      },
      renders: {
        total: renderStats.reduce((sum, r) => sum + r.renderCount, 0),
        averageTime: renderStats.length > 0 
          ? renderStats.reduce((sum, r) => sum + r.averageRenderTime, 0) / renderStats.length 
          : 0,
        slowRenders: renderStats.reduce((sum, r) => sum + r.slowRenders, 0)
      },
      apis: {
        total: apiStats.reduce((sum, a) => sum + a.requestCount, 0),
        successRate: apiStats.length > 0
          ? (apiStats.reduce((sum, a) => sum + a.successCount, 0) / apiStats.reduce((sum, a) => sum + a.requestCount, 0)) * 100
          : 100,
        averageTime: apiStats.length > 0
          ? apiStats.reduce((sum, a) => sum + a.averageResponseTime, 0) / apiStats.length
          : 0
      },
      memory: memoryMetrics ? {
        usage: (memoryMetrics.usedJSHeapSize / 1024 / 1024).toFixed(2) + 'MB',
        percentage: memoryMetrics.usagePercentage.toFixed(1) + '%',
        trend: memoryMetrics.trend
      } : null,
      alerts: {
        total: activeAlerts.length,
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        high: activeAlerts.filter(a => a.severity === 'high').length
      }
    };
  }, [renderMetrics, apiMetrics, memoryMetrics, performanceAlerts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reportingInterval.current) {
        clearInterval(reportingInterval.current);
      }
      webVitalsCleanup.current.forEach(cleanup => cleanup());
    };
  }, []);

  return {
    // Metrics
    renderMetrics: Array.from(renderMetrics.values()),
    apiMetrics: Array.from(apiMetrics.values()),
    memoryMetrics,
    webVitalsMetrics,
    userInteractionMetrics,
    performanceAlerts,
    
    // Tracking functions
    trackRender,
    trackAPI,
    trackMemory,
    trackInteraction,
    endTask,
    
    // Alert management
    resolveAlert,
    clearResolvedAlerts,
    
    // Summary
    getPerformanceSummary,
    
    // Configuration
    config: mergedConfig
  };
}

/**
 * HOC for automatic render tracking
 */
export function withRenderTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
) {
  return React.memo((props: P) => {
    const { trackRender } = usePerformanceMonitoring();
    const name = componentName || Component.displayName || Component.name || 'Unknown';
    
    React.useEffect(() => {
      const startTime = performance.now();
      
      return () => {
        const renderTime = performance.now() - startTime;
        trackRender(name, renderTime);
      };
    });
    
    return React.createElement(Component, props);
  });
}

/**
 * Hook for component-specific performance tracking
 */
export function useComponentPerformance(componentName: string) {
  const { trackRender, renderMetrics } = usePerformanceMonitoring();
  
  React.useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const renderTime = performance.now() - startTime;
      trackRender(componentName, renderTime);
    };
  });
  
  const componentMetrics = renderMetrics.find(m => m.componentName === componentName);
  
  return {
    metrics: componentMetrics,
    isOptimal: (componentMetrics?.averageRenderTime || 0) < 16
  };
}

// Re-export React for hooks
import React from 'react';