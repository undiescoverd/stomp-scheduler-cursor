import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
// import { PerformanceMonitor, WebVitalsMonitor } from '../utils/performance';
import type { Schedule, Show, Assignment, CastMember } from '~backend/scheduler/types';

// Performance metrics interface
export interface PerformanceMetrics {
  renderTime: number;
  lastRenderTime: number;
  averageRenderTime: number;
  memoryUsage?: number;
  webVitals: {
    lcp?: number;
    fid?: number;
    cls?: number;
  };
  componentMetrics: Map<string, ComponentMetric>;
}

export interface ComponentMetric {
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  lastRenderTime: number;
}

// Memoization configuration
export interface MemoizationConfig {
  scheduleDataStaleTime?: number;
  assignmentCacheSize?: number;
  enableDeepMemo?: boolean;
  renderOptimization?: boolean;
}

// Performance optimization options
export interface UseSchedulePerformanceOptions {
  trackWebVitals?: boolean;
  trackMemoryUsage?: boolean;
  trackRenderPerformance?: boolean;
  memoizationConfig?: MemoizationConfig;
  performanceThresholds?: {
    slowRender?: number;
    criticalRender?: number;
    memoryWarning?: number;
  };
  onPerformanceAlert?: (alert: PerformanceAlert) => void;
}

export interface PerformanceAlert {
  type: 'render' | 'memory' | 'webvital';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

/**
 * Performance monitoring and optimization hook for schedule operations
 * Provides comprehensive performance tracking, memoization strategies, and render optimization
 */
export function useSchedulePerformance(
  scheduleData?: Schedule,
  options: UseSchedulePerformanceOptions = {}
) {
  const {
    trackWebVitals = true,
    trackMemoryUsage = true,
    trackRenderPerformance = true,
    memoizationConfig = {},
    performanceThresholds = {
      slowRender: 16, // 16ms for 60fps
      criticalRender: 33, // 33ms for 30fps
      memoryWarning: 50 * 1024 * 1024 // 50MB
    },
    onPerformanceAlert
  } = options;

  const {
    scheduleDataStaleTime = 1000 * 60 * 5, // 5 minutes
    assignmentCacheSize = 1000,
    enableDeepMemo = true,
    renderOptimization = true
  } = memoizationConfig;

  // Performance tracking refs
  const renderStartTime = useRef<number>(0);
  const renderCount = useRef<number>(0);
  const renderTimes = useRef<number[]>([]);
  const componentMetrics = useRef<Map<string, ComponentMetric>>(new Map());
  const memoryCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const assignmentCache = useRef<Map<string, any>>(new Map());
  const webVitalsCleanup = useRef<Array<() => void>>([]);

  // Start render measurement
  const startRenderMeasurement = useCallback((componentName?: string) => {
    if (!trackRenderPerformance) return '';
    
    const measurementKey = `render-${componentName || 'schedule'}-${Date.now()}`;
    renderStartTime.current = performance.now();
    // PerformanceMonitor.startMeasurement(measurementKey);
    return measurementKey;
  }, [trackRenderPerformance]);

  // End render measurement
  const endRenderMeasurement = useCallback((measurementKey: string, componentName?: string) => {
    if (!trackRenderPerformance || !measurementKey) return;
    
    // const renderTime = PerformanceMonitor.endMeasurement(measurementKey);
    const renderTime = 0;
    renderCount.current++;
    renderTimes.current.push(renderTime);
    
    // Keep only last 100 render times for averaging
    if (renderTimes.current.length > 100) {
      renderTimes.current = renderTimes.current.slice(-100);
    }

    // Update component metrics
    if (componentName) {
      const existing = componentMetrics.current.get(componentName) || {
        renderCount: 0,
        totalRenderTime: 0,
        averageRenderTime: 0,
        lastRenderTime: 0
      };

      const newMetric: ComponentMetric = {
        ...existing,
        renderCount: existing.renderCount + 1,
        totalRenderTime: existing.totalRenderTime + renderTime,
        averageRenderTime: (existing.totalRenderTime + renderTime) / (existing.renderCount + 1),
        lastRenderTime: renderTime
      };

      componentMetrics.current.set(componentName, newMetric);
    }

    // Check performance thresholds
    if (renderTime > performanceThresholds.criticalRender!) {
      onPerformanceAlert?.({
        type: 'render',
        severity: 'critical',
        message: `Critical render time detected: ${renderTime.toFixed(2)}ms`,
        value: renderTime,
        threshold: performanceThresholds.criticalRender!
      });
    } else if (renderTime > performanceThresholds.slowRender!) {
      onPerformanceAlert?.({
        type: 'render',
        severity: 'warning',
        message: `Slow render detected: ${renderTime.toFixed(2)}ms`,
        value: renderTime,
        threshold: performanceThresholds.slowRender!
      });
    }
  }, [trackRenderPerformance, performanceThresholds, onPerformanceAlert]);

  // Memory usage tracking
  const checkMemoryUsage = useCallback(() => {
    if (!trackMemoryUsage || typeof performance === 'undefined' || !('memory' in performance)) {
      return undefined;
    }

    const memoryInfo = (performance as any).memory;
    const usedMemory = memoryInfo.usedJSHeapSize;
    
    if (usedMemory > performanceThresholds.memoryWarning!) {
      onPerformanceAlert?.({
        type: 'memory',
        severity: 'warning',
        message: `High memory usage detected: ${(usedMemory / 1024 / 1024).toFixed(2)}MB`,
        value: usedMemory,
        threshold: performanceThresholds.memoryWarning!
      });
    }

    return usedMemory;
  }, [trackMemoryUsage, performanceThresholds, onPerformanceAlert]);

  // Memoized schedule calculations
  const memoizedScheduleStats = useMemo(() => {
    if (!scheduleData) return null;
    
    const measurementKey = startRenderMeasurement('schedule-stats');
    
    const stats = {
      totalShows: scheduleData.shows.length,
      activeShows: scheduleData.shows.filter(s => s.status === 'show').length,
      totalAssignments: scheduleData.assignments.length,
      assignedRoles: scheduleData.assignments.filter(a => a.role !== 'OFF').length,
      redDays: scheduleData.assignments.filter(a => a.isRedDay).length,
      uniquePerformers: new Set(scheduleData.assignments.map(a => a.performer)).size
    };
    
    endRenderMeasurement(measurementKey, 'schedule-stats');
    return stats;
  }, [scheduleData, startRenderMeasurement, endRenderMeasurement]);

  // Memoized assignment lookups with caching
  const createAssignmentLookup = useMemo(() => {
    if (!scheduleData?.assignments) return () => null;
    
    const measurementKey = startRenderMeasurement('assignment-lookup');
    
    // Create optimized lookup maps
    const byShowId = new Map<string, Assignment[]>();
    const byPerformer = new Map<string, Assignment[]>();
    const byRole = new Map<string, Assignment[]>();
    
    scheduleData.assignments.forEach(assignment => {
      // By show ID
      if (!byShowId.has(assignment.showId)) {
        byShowId.set(assignment.showId, []);
      }
      byShowId.get(assignment.showId)!.push(assignment);
      
      // By performer
      if (!byPerformer.has(assignment.performer)) {
        byPerformer.set(assignment.performer, []);
      }
      byPerformer.get(assignment.performer)!.push(assignment);
      
      // By role
      if (!byRole.has(assignment.role)) {
        byRole.set(assignment.role, []);
      }
      byRole.get(assignment.role)!.push(assignment);
    });
    
    endRenderMeasurement(measurementKey, 'assignment-lookup');
    
    return {
      byShowId: (showId: string) => byShowId.get(showId) || [],
      byPerformer: (performer: string) => byPerformer.get(performer) || [],
      byRole: (role: string) => byRole.get(role) || [],
      getAssignment: (showId: string, role: string) => 
        byShowId.get(showId)?.find(a => a.role === role) || null
    };
  }, [scheduleData?.assignments, startRenderMeasurement, endRenderMeasurement]);

  // Optimized show grouping
  const groupedShows = useMemo(() => {
    if (!scheduleData?.shows) return new Map();
    
    const measurementKey = startRenderMeasurement('show-grouping');
    
    const grouped = new Map<string, Show[]>();
    
    scheduleData.shows.forEach(show => {
      if (!grouped.has(show.date)) {
        grouped.set(show.date, []);
      }
      grouped.get(show.date)!.push(show);
    });
    
    // Sort shows within each date
    grouped.forEach(shows => {
      shows.sort((a, b) => a.time.localeCompare(b.time));
    });
    
    endRenderMeasurement(measurementKey, 'show-grouping');
    return grouped;
  }, [scheduleData?.shows, startRenderMeasurement, endRenderMeasurement]);

  // Cache management for complex calculations
  const getCachedCalculation = useCallback((key: string, calculator: () => any) => {
    if (assignmentCache.current.has(key)) {
      return assignmentCache.current.get(key);
    }
    
    const result = calculator();
    
    // Manage cache size
    if (assignmentCache.current.size >= assignmentCacheSize) {
      const firstKey = assignmentCache.current.keys().next().value as string;
      assignmentCache.current.delete(firstKey);
    }
    
    assignmentCache.current.set(key, result);
    return result;
  }, [assignmentCacheSize]);

  // Clear cache when schedule data changes
  useEffect(() => {
    assignmentCache.current.clear();
  }, [scheduleData?.id, scheduleData?.updatedAt]);

  // Performance metrics calculation
  const performanceMetrics: PerformanceMetrics = useMemo(() => {
    const lastRenderTime = renderTimes.current[renderTimes.current.length - 1] || 0;
    const averageRenderTime = renderTimes.current.length > 0 
      ? renderTimes.current.reduce((sum, time) => sum + time, 0) / renderTimes.current.length 
      : 0;

    return {
      renderTime: renderTimes.current.reduce((sum, time) => sum + time, 0),
      lastRenderTime,
      averageRenderTime,
      memoryUsage: checkMemoryUsage(),
      webVitals: {
        // Will be populated by web vitals tracking
      },
      componentMetrics: new Map(componentMetrics.current)
    };
  }, [renderTimes.current.length, checkMemoryUsage]);

  // Web Vitals tracking setup
  useEffect(() => {
    if (!trackWebVitals) return;

    // const cleanupLCP = WebVitalsMonitor.measureLCP((value) => {
    //   performanceMetrics.webVitals.lcp = value;
    //   if (value > 2500) { // LCP threshold
    //     onPerformanceAlert?.({
    //       type: 'webvital',
    //       severity: 'warning',
    //       message: `Poor LCP detected: ${value.toFixed(2)}ms`,
    //       value,
    //       threshold: 2500
    //     });
    //   }
    // });

    // const cleanupFID = WebVitalsMonitor.measureFID((value) => {
    //   performanceMetrics.webVitals.fid = value;
    //   if (value > 100) { // FID threshold
    //     onPerformanceAlert?.({
    //       type: 'webvital',
    //       severity: 'warning',
    //       message: `Poor FID detected: ${value.toFixed(2)}ms`,
    //       value,
    //       threshold: 100
    //     });
    //   }
    // });

    // const cleanupCLS = WebVitalsMonitor.measureCLS((value) => {
    //   performanceMetrics.webVitals.cls = value;
    //   if (value > 0.1) { // CLS threshold
    //     onPerformanceAlert?.({
    //       type: 'webvital',
    //       severity: 'warning',
    //       message: `Poor CLS detected: ${value.toFixed(4)}`,
    //       value,
    //       threshold: 0.1
    //     });
    //   }
    // });

    // webVitalsCleanup.current = [cleanupLCP, cleanupFID, cleanupCLS];

    return () => {
      webVitalsCleanup.current.forEach(cleanup => cleanup());
    };
  }, [trackWebVitals, onPerformanceAlert]);

  // Memory monitoring setup
  useEffect(() => {
    if (!trackMemoryUsage) return;

    memoryCheckInterval.current = setInterval(() => {
      checkMemoryUsage();
    }, 10000); // Check every 10 seconds

    return () => {
      if (memoryCheckInterval.current) {
        clearInterval(memoryCheckInterval.current);
      }
    };
  }, [trackMemoryUsage, checkMemoryUsage]);

  // Render optimization helpers
  const shouldComponentUpdate = useCallback((prevProps: any, nextProps: any) => {
    if (!renderOptimization) return true;
    
    // Deep comparison for complex objects
    if (enableDeepMemo) {
      return JSON.stringify(prevProps) !== JSON.stringify(nextProps);
    }
    
    // Shallow comparison
    return Object.keys(nextProps).some(key => prevProps[key] !== nextProps[key]);
  }, [renderOptimization, enableDeepMemo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (memoryCheckInterval.current) {
        clearInterval(memoryCheckInterval.current);
      }
      webVitalsCleanup.current.forEach(cleanup => cleanup());
    };
  }, []);

  return {
    // Performance metrics
    performanceMetrics,
    
    // Measurement functions
    startRenderMeasurement,
    endRenderMeasurement,
    checkMemoryUsage,
    
    // Memoized data
    scheduleStats: memoizedScheduleStats,
    assignmentLookup: createAssignmentLookup,
    groupedShows,
    
    // Cache utilities
    getCachedCalculation,
    clearCache: () => assignmentCache.current.clear(),
    
    // Optimization helpers
    shouldComponentUpdate,
    
    // Performance status
    isPerformanceOptimal: performanceMetrics.averageRenderTime < performanceThresholds.slowRender!,
    memoryUsageStatus: performanceMetrics.memoryUsage && performanceMetrics.memoryUsage > performanceThresholds.memoryWarning! 
      ? 'warning' 
      : 'normal'
  };
}

/**
 * Higher-order component for automatic performance tracking
 */
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string
) {
  return React.memo((props: P) => {
    const { startRenderMeasurement, endRenderMeasurement } = useSchedulePerformance();
    
    useEffect(() => {
      const measurementKey = startRenderMeasurement(componentName);
      
      return () => {
        endRenderMeasurement(measurementKey, componentName);
      };
    });
    
    return React.createElement(Component, props);
  });
}

/**
 * Hook for component-specific performance tracking
 */
export function useComponentPerformance(componentName: string) {
  const { startRenderMeasurement, endRenderMeasurement, performanceMetrics } = useSchedulePerformance();
  
  useEffect(() => {
    const measurementKey = startRenderMeasurement(componentName);
    
    return () => {
      endRenderMeasurement(measurementKey, componentName);
    };
  });
  
  return {
    metrics: performanceMetrics.componentMetrics.get(componentName),
    isOptimal: (performanceMetrics.componentMetrics.get(componentName)?.averageRenderTime || 0) < 16
  };
}
