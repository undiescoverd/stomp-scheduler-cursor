/**
 * STOMP Scheduler Hooks Library
 * Comprehensive set of React hooks for schedule management operations
 */

// Core schedule management
export { 
  useScheduleManager,
  type ScheduleState,
  type AssignmentChange,
  type ValidationResult,
  type UseScheduleManagerOptions
} from './useScheduleManager';

// Performance optimization and monitoring
export { 
  useSchedulePerformance,
  withPerformanceTracking,
  useComponentPerformance,
  type PerformanceMetrics,
  type ComponentMetric,
  type MemoizationConfig,
  type UseSchedulePerformanceOptions,
  type PerformanceAlert
} from './useSchedulePerformance';

// Real-time validation
export { 
  useScheduleValidation,
  type ValidationState,
  type FieldValidation,
  type ConstraintValidation,
  type ConstraintResult,
  type UseScheduleValidationOptions,
  type CustomValidator,
  type ValidationAlert as ValidationAlertType
} from './useScheduleValidation';

// Export operations
export { 
  useScheduleExport,
  type ExportFormat,
  type ExportType,
  type ExportOperation,
  type ExportHistoryEntry,
  type ExportOptions,
  type UseScheduleExportOptions
} from './useScheduleExport';

// Optimized React Query configuration
export { 
  createOptimizedQueryClient,
  useOptimizedQueryClient,
  useQueryOptimization,
  type InvalidationStrategy,
  type CacheConfig,
  type QueryPerformanceMetrics
} from './useOptimizedQueryClient';

// Comprehensive performance monitoring
export { 
  usePerformanceMonitoring,
  withRenderTracking,
  type RenderMetrics,
  type APIMetrics,
  type MemoryMetrics,
  type UserInteractionMetrics,
  type WebVitalsMetrics,
  type PerformanceAlert as PerfAlert,
  type PerformanceMonitoringConfig
} from './usePerformanceMonitoring';

// Existing hooks
export { 
  useExportAPI,
  type ExportDataResponse,
  type CallSheetResponse,
  type UtilizationReportResponse
} from './useExportAPI';

// Analytics hooks (from utils)
export {
  useAnalytics,
  usePerformerAnalytics,
  useRoleAnalytics,
  useComparativeAnalytics,
  type UseAnalyticsOptions,
  type AnalyticsData
} from '../utils/hooks/useAnalytics';

/**
 * Additional imports for hook combinations
 */
import { useScheduleManager } from './useScheduleManager';
import { useScheduleValidation } from './useScheduleValidation';
import { useSchedulePerformance } from './useSchedulePerformance';
import { usePerformanceMonitoring } from './usePerformanceMonitoring';
import type { UseScheduleManagerOptions } from './useScheduleManager';
import type { UseScheduleValidationOptions } from './useScheduleValidation';
import type { UseSchedulePerformanceOptions } from './useSchedulePerformance';
import type { PerformanceMonitoringConfig } from './usePerformanceMonitoring';

/**
 * Hook combinations for common use cases
 */

/**
 * Combined hook for comprehensive schedule management
 * Includes state management, validation, and performance tracking
 */
export function useScheduleManagement(
  scheduleId?: string,
  options: {
    manager?: UseScheduleManagerOptions;
    validation?: UseScheduleValidationOptions;
    performance?: UseSchedulePerformanceOptions;
    monitoring?: PerformanceMonitoringConfig;
  } = {}
) {
  const manager = useScheduleManager({
    scheduleId,
    ...options.manager
  });

  const validation = useScheduleValidation(
    manager.shows,
    manager.assignments,
    {
      enableRealTimeValidation: true,
      validationLevel: 'comprehensive',
      ...options.validation
    }
  );

  const performance = useSchedulePerformance(
    manager as any,
    {
      trackRenderPerformance: true,
      trackMemoryUsage: true,
      trackWebVitals: true,
      ...options.performance
    }
  );

  const monitoring = usePerformanceMonitoring({
    enableRenderTracking: true,
    enableAPITracking: true,
    enableMemoryTracking: true,
    enableWebVitalsTracking: true,
    enableUserInteractionTracking: true,
    ...options.monitoring
  });

  return {
    // Schedule management
    ...manager,
    
    // Validation
    validation,
    
    // Performance
    performance,
    
    // Monitoring
    monitoring,
    
    // Combined status
    isHealthy: !validation.isValidating && 
               validation.validationState.isValid && 
               performance.isPerformanceOptimal &&
               monitoring.getPerformanceSummary().overall.status !== 'critical',
    
    // Combined metrics
    healthScore: Math.min(
      validation.validationState.overallScore,
      performance.performanceMetrics.componentMetrics.size > 0 
        ? Array.from(performance.performanceMetrics.componentMetrics.values())
            .reduce((sum, m) => sum + (m.averageRenderTime < 16 ? 100 : 50), 0) /
          performance.performanceMetrics.componentMetrics.size
        : 100,
      monitoring.getPerformanceSummary().overall.score
    )
  };
}

/**
 * Lightweight hook for read-only schedule operations
 * Optimized for display components with minimal overhead
 */
export function useScheduleDisplay(scheduleId?: string) {
  const manager = useScheduleManager({
    scheduleId,
    enableAutoSave: false,
    enableOptimisticUpdates: false
  });

  const performance = useSchedulePerformance(
    manager as any,
    {
      trackRenderPerformance: true,
      trackMemoryUsage: false,
      trackWebVitals: false,
      memoizationConfig: {
        enableDeepMemo: true,
        renderOptimization: true
      }
    }
  );

  return {
    // Read-only state
    schedule: manager,
    stats: manager.stats,
    castMembers: manager.castMembers,
    roles: manager.roles,
    isLoading: manager.isLoading,
    error: manager.error,
    
    // Optimized data accessors
    assignmentLookup: performance.assignmentLookup,
    groupedShows: performance.groupedShows,
    scheduleStats: performance.scheduleStats,
    
    // Performance helpers
    shouldComponentUpdate: performance.shouldComponentUpdate,
    getCachedCalculation: performance.getCachedCalculation
  };
}

/**
 * Hook for schedule editing with full validation and performance tracking
 */
export function useScheduleEditor(scheduleId?: string) {
  const manager = useScheduleManager({
    scheduleId,
    enableAutoSave: true,
    enableOptimisticUpdates: true,
    autoSaveIntervalMs: 30000
  });

  const validation = useScheduleValidation(
    manager.shows,
    manager.assignments,
    {
      enableRealTimeValidation: true,
      enableConstraintChecking: true,
      enableSuggestions: true,
      validationLevel: 'comprehensive',
      validationDebounceMs: 300
    }
  );

  const performance = useSchedulePerformance(
    manager as any,
    {
      trackRenderPerformance: true,
      trackMemoryUsage: true,
      trackWebVitals: true,
      memoizationConfig: {
        enableDeepMemo: false, // Less overhead for editing
        renderOptimization: true
      },
      onPerformanceAlert: (alert) => {
        if (alert.severity === 'critical') {
          console.warn('Performance alert in schedule editor:', alert);
        }
      }
    }
  );

  return {
    // Full schedule management
    ...manager,
    
    // Validation with auto-suggestions
    validation,
    
    // Performance optimization
    performance,
    
    // Editor-specific helpers
    canSave: manager.isDirty && 
             validation.validationState.isValid && 
             !manager.isSaving,
    
    hasErrors: validation.validationState.errors.length > 0,
    hasWarnings: validation.validationState.warnings.length > 0,
    
    // Quick actions
    quickAssign: manager.handleAssignmentChange,
    quickUnassign: manager.handleRemoveShow,
    quickToggleRed: manager.handleShowStatusChange,
    
    // Validation helpers
    getFieldErrors: validation.getFieldValidation,
    getConstraintViolations: (category: string) => 
      validation.getIssuesByCategory(category),
    getSuggestions: validation.getSuggestionsForPerformer
  };
}

/**
 * Hook for analytics and reporting
 */
export function useScheduleAnalytics(scheduleId?: string) {
  const manager = useScheduleManager({
    scheduleId,
    enableAutoSave: false,
    enableOptimisticUpdates: false
  });

  const performance = useSchedulePerformance(
    manager as any,
    {
      trackRenderPerformance: false,
      trackMemoryUsage: false,
      trackWebVitals: false,
      memoizationConfig: {
        enableDeepMemo: true,
        scheduleDataStaleTime: 1000 * 60 * 10 // 10 minutes for analytics
      }
    }
  );

  return {
    // Schedule data
    schedule: manager,
    stats: manager.stats,
    isLoading: manager.isLoading,
    error: manager.error,
    
    // Optimized analytics data
    scheduleStats: performance.scheduleStats,
    assignmentLookup: performance.assignmentLookup,
    groupedShows: performance.groupedShows,
    
    // Performance metrics for reporting
    performanceMetrics: performance.performanceMetrics,
    
    // Cached calculations
    getCachedCalculation: performance.getCachedCalculation
  };
}

export default {
  useScheduleManager,
  useScheduleValidation,
  useSchedulePerformance,
  useScheduleExport,
  createOptimizedQueryClient,
  useOptimizedQueryClient,
  usePerformanceMonitoring,
  useScheduleManagement,
  useScheduleDisplay,
  useScheduleEditor,
  useScheduleAnalytics
};