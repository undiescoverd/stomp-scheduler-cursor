# STOMP Scheduler Hooks Library

A comprehensive set of React hooks for managing schedule operations in the STOMP Performance Scheduler application. This library provides centralized state management, real-time validation, performance optimization, and export functionality.

## Overview

The hooks system is designed with performance, accessibility, and developer experience in mind. Each hook is fully typed, tested, and optimized for the specific needs of theatrical schedule management.

## Core Hooks

### 🗃️ useScheduleManager

**Purpose**: Centralized schedule state management with assignment manipulation and form state management.

```typescript
import { useScheduleManager } from '@/hooks';

function ScheduleEditor() {
  const {
    scheduleState,
    stats,
    assignPerformer,
    unassignPerformer,
    toggleRedDay,
    saveChanges,
    isSaving
  } = useScheduleManager({
    scheduleId: 'schedule-123',
    enableAutoSave: true,
    autoSaveIntervalMs: 30000
  });

  return (
    <div>
      <h1>{scheduleState.location} - {scheduleState.week}</h1>
      <p>Completion: {stats.completionRate.toFixed(1)}%</p>
      <button 
        onClick={() => assignPerformer('show-1', 'Sarge', 'PHIL')}
        disabled={isSaving}
      >
        Assign PHIL to Sarge
      </button>
    </div>
  );
}
```

**Features**:
- ✅ Optimistic updates for instant UI feedback
- ✅ Auto-save with configurable intervals
- ✅ Comprehensive state tracking (isDirty, lastSaved, etc.)
- ✅ Assignment manipulation (assign, unassign, swap, toggle red days)
- ✅ Real-time statistics calculation
- ✅ Bulk operations support
- ✅ Undo/reset functionality

### ⚡ useSchedulePerformance

**Purpose**: Performance monitoring and optimization with memoization strategies and render optimization.

```typescript
import { useSchedulePerformance, withPerformanceTracking } from '@/hooks';

function OptimizedScheduleGrid({ schedule }) {
  const {
    performanceMetrics,
    assignmentLookup,
    groupedShows,
    getCachedCalculation,
    shouldComponentUpdate
  } = useSchedulePerformance(schedule, {
    trackRenderPerformance: true,
    trackMemoryUsage: true,
    trackWebVitals: true,
    onPerformanceAlert: (alert) => {
      if (alert.severity === 'critical') {
        console.warn('Performance issue:', alert);
      }
    }
  });

  // Use optimized data accessors
  const assignments = assignmentLookup.byShowId('show-1');
  const shows = groupedShows.get('2024-01-01') || [];

  // Cache expensive calculations
  const complexCalculation = getCachedCalculation('complex-calc', () => {
    return expensiveOperation(schedule);
  });

  return (
    <div>
      <p>Avg Render Time: {performanceMetrics.averageRenderTime.toFixed(2)}ms</p>
      {/* Optimized rendering */}
    </div>
  );
}

export default withPerformanceTracking(OptimizedScheduleGrid, 'ScheduleGrid');
```

**Features**:
- ✅ Automatic render performance tracking
- ✅ Memory usage monitoring
- ✅ Web Vitals measurement (LCP, FID, CLS)
- ✅ Intelligent memoization with cache management
- ✅ Optimized data structures for fast lookups
- ✅ Performance alerts and recommendations
- ✅ HOC for automatic component tracking

### ✅ useScheduleValidation

**Purpose**: Real-time validation with constraint checking and intelligent suggestions.

```typescript
import { useScheduleValidation } from '@/hooks';

function ValidationPanel({ shows, assignments }) {
  const {
    validationState,
    constraintValidation,
    validateField,
    getFieldValidation,
    getSuggestionsForPerformer,
    validateNow
  } = useScheduleValidation(shows, assignments, {
    enableRealTimeValidation: true,
    enableConstraintChecking: true,
    enableSuggestions: true,
    validationLevel: 'comprehensive'
  });

  const fieldValidation = getFieldValidation('performer');
  const suggestions = getSuggestionsForPerformer('PHIL');

  return (
    <div>
      <div className={`status ${validationState.isValid ? 'valid' : 'invalid'}`}>
        Score: {validationState.overallScore}/100
      </div>
      
      {validationState.errors.map(error => (
        <div key={error.category} className="error">
          {error.message}
          {error.suggestion && (
            <span className="suggestion">{error.suggestion}</span>
          )}
        </div>
      ))}
      
      {suggestions.length > 0 && (
        <div className="suggestions">
          <h4>Suggestions for PHIL:</h4>
          {suggestions.map(suggestion => (
            <p key={suggestion}>{suggestion}</p>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Features**:
- ✅ Real-time validation with debouncing
- ✅ Comprehensive constraint checking (role eligibility, consecutive shows, load balancing)
- ✅ Field-level validation with specific error messages
- ✅ Intelligent suggestions and auto-fix recommendations
- ✅ Custom validator support
- ✅ Performance-optimized validation pipeline

### 📤 useScheduleExport

**Purpose**: Export operation management with progress tracking and multiple format support.

```typescript
import { useScheduleExport } from '@/hooks';

function ExportPanel({ scheduleId }) {
  const {
    exportSchedule,
    exportAsPDF,
    exportAsExcel,
    exportAsICal,
    activeOperations,
    exportHistory,
    exportMetrics,
    isExporting
  } = useScheduleExport({
    scheduleId,
    enableProgressTracking: true,
    enableCaching: true,
    onExportComplete: (operation) => {
      console.log('Export completed:', operation);
    }
  });

  const handleExportPDF = async () => {
    try {
      await exportAsPDF('schedule', {
        includeRedDays: true,
        dateRange: {
          start: '2024-01-01',
          end: '2024-01-07'
        }
      });
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div>
      <button onClick={handleExportPDF} disabled={isExporting}>
        Export as PDF
      </button>
      
      {activeOperations.map(op => (
        <div key={op.id} className="export-progress">
          <span>{op.type} - {op.format}</span>
          <progress value={op.progress} max={100} />
          <span>{op.status}</span>
        </div>
      ))}
      
      <div className="export-stats">
        <p>Success Rate: {exportMetrics.successRate.toFixed(1)}%</p>
        <p>Total Exports: {exportMetrics.total}</p>
      </div>
    </div>
  );
}
```

**Features**:
- ✅ Multiple export formats (PDF, Excel, CSV, iCal, JSON)
- ✅ Progress tracking with real-time updates
- ✅ Export history and metrics
- ✅ Intelligent caching to avoid duplicate operations
- ✅ Background processing with cancellation support
- ✅ Configurable export options and templates

### 🚀 useOptimizedQueryClient

**Purpose**: Enhanced React Query configuration with smart caching and performance monitoring.

```typescript
import { useOptimizedQueryClient, createOptimizedQueryClient } from '@/hooks';

// App-level setup
const queryClient = createOptimizedQueryClient({
  scheduleStaleTime: 1000 * 60 * 5, // 5 minutes
  assignmentStaleTime: 1000 * 60 * 2, // 2 minutes
  castMemberStaleTime: 1000 * 60 * 30, // 30 minutes
  maxCacheSize: 50
});

// Component-level usage
function ScheduleComponent() {
  const {
    invalidateQueries,
    prefetchRelatedData,
    getPerformanceMetrics,
    deduplicateRequests
  } = useOptimizedQueryClient();

  const handleScheduleUpdate = async () => {
    // Update schedule...
    
    // Smart invalidation based on what changed
    await invalidateQueries('scheduleUpdated');
    
    // Prefetch related data
    await prefetchRelatedData('schedule-123');
  };

  const metrics = getPerformanceMetrics();

  return (
    <div>
      <p>Cache Hit Rate: {metrics.cacheHitRate.toFixed(1)}%</p>
      <p>Success Rate: {(metrics.successfulQueries / metrics.totalQueries * 100).toFixed(1)}%</p>
    </div>
  );
}
```

**Features**:
- ✅ Smart invalidation strategies
- ✅ Automatic cache size management
- ✅ Request deduplication
- ✅ Background refetching optimization
- ✅ Performance metrics and monitoring
- ✅ Enhanced error handling with retry strategies

### 📊 usePerformanceMonitoring

**Purpose**: Comprehensive performance monitoring for renders, API calls, memory, and user interactions.

```typescript
import { usePerformanceMonitoring, withRenderTracking } from '@/hooks';

function PerformanceDashboard() {
  const {
    renderMetrics,
    apiMetrics,
    memoryMetrics,
    webVitalsMetrics,
    userInteractionMetrics,
    performanceAlerts,
    getPerformanceSummary
  } = usePerformanceMonitoring({
    enableRenderTracking: true,
    enableAPITracking: true,
    enableMemoryTracking: true,
    enableWebVitalsTracking: true,
    alertThresholds: {
      slowRender: 16, // 60fps
      criticalRender: 33, // 30fps
      memoryWarning: 50 * 1024 * 1024 // 50MB
    }
  });

  const summary = getPerformanceSummary();

  return (
    <div>
      <h2>Performance Summary</h2>
      <div className={`status-${summary.overall.status}`}>
        Overall Score: {summary.overall.score}/100
      </div>
      
      <div>
        <h3>Renders</h3>
        <p>Average Time: {summary.renders.averageTime.toFixed(2)}ms</p>
        <p>Slow Renders: {summary.renders.slowRenders}</p>
      </div>
      
      <div>
        <h3>APIs</h3>
        <p>Success Rate: {summary.apis.successRate.toFixed(1)}%</p>
        <p>Average Time: {summary.apis.averageTime.toFixed(2)}ms</p>
      </div>
      
      {memoryMetrics && (
        <div>
          <h3>Memory</h3>
          <p>Usage: {(memoryMetrics.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB</p>
          <p>Trend: {memoryMetrics.trend}</p>
        </div>
      )}
      
      <div>
        <h3>Active Alerts</h3>
        {performanceAlerts.filter(a => !a.resolved).map(alert => (
          <div key={alert.id} className={`alert-${alert.severity}`}>
            {alert.message}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Features**:
- ✅ Comprehensive performance tracking (renders, APIs, memory, Web Vitals)
- ✅ User interaction monitoring
- ✅ Real-time alerts with configurable thresholds
- ✅ Performance trend analysis
- ✅ Automatic reporting to analytics services
- ✅ Memory leak detection

## Combined Hooks

### 🎯 useScheduleManagement

**Purpose**: Combined hook that integrates state management, validation, and performance monitoring.

```typescript
import { useScheduleManagement } from '@/hooks';

function ComprehensiveScheduleEditor({ scheduleId }) {
  const {
    // Schedule management
    scheduleState,
    stats,
    assignPerformer,
    saveChanges,
    
    // Validation
    validation,
    
    // Performance
    performance,
    
    // Monitoring
    monitoring,
    
    // Combined status
    isHealthy,
    healthScore
  } = useScheduleManagement(scheduleId, {
    manager: {
      enableAutoSave: true,
      autoSaveIntervalMs: 30000
    },
    validation: {
      enableRealTimeValidation: true,
      validationLevel: 'comprehensive'
    },
    performance: {
      trackRenderPerformance: true,
      trackMemoryUsage: true
    }
  });

  return (
    <div>
      <div className={`health-indicator ${isHealthy ? 'healthy' : 'unhealthy'}`}>
        Health Score: {healthScore.toFixed(1)}/100
      </div>
      
      <div className="validation-summary">
        Validation Score: {validation.validationState.overallScore}/100
        {validation.validationState.errors.length > 0 && (
          <span className="error-count">
            {validation.validationState.errors.length} errors
          </span>
        )}
      </div>
      
      {/* Schedule editor content */}
    </div>
  );
}
```

### 📱 useScheduleDisplay

**Purpose**: Lightweight hook optimized for read-only display components.

```typescript
import { useScheduleDisplay } from '@/hooks';

function ScheduleViewer({ scheduleId }) {
  const {
    schedule,
    stats,
    assignmentLookup,
    groupedShows,
    shouldComponentUpdate,
    isLoading
  } = useScheduleDisplay(scheduleId);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{schedule.location} - {schedule.week}</h1>
      <p>Completion: {stats.completionRate.toFixed(1)}%</p>
      
      {Array.from(groupedShows.entries()).map(([date, shows]) => (
        <div key={date}>
          <h3>{date}</h3>
          {shows.map(show => (
            <div key={show.id}>
              {show.time} - {assignmentLookup.byShowId(show.id).length} roles assigned
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### ✏️ useScheduleEditor

**Purpose**: Full-featured editing hook with validation and auto-save.

```typescript
import { useScheduleEditor } from '@/hooks';

function AdvancedScheduleEditor({ scheduleId }) {
  const {
    // Enhanced management
    scheduleState,
    stats,
    quickAssign,
    quickUnassign,
    quickToggleRed,
    
    // Validation helpers
    canSave,
    hasErrors,
    hasWarnings,
    getFieldErrors,
    getConstraintViolations,
    getSuggestions,
    
    // Status
    isSaving,
    validation
  } = useScheduleEditor(scheduleId);

  return (
    <div className="schedule-editor">
      <div className="toolbar">
        <button 
          onClick={() => quickAssign('show-1', 'Sarge', 'PHIL')}
          disabled={!canSave}
        >
          Quick Assign
        </button>
        
        <div className={`status ${hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok'}`}>
          {hasErrors ? 'Has Errors' : hasWarnings ? 'Has Warnings' : 'OK'}
        </div>
      </div>
      
      {/* Editor content with validation feedback */}
      <div className="validation-panel">
        {getConstraintViolations('role_eligibility').map(violation => (
          <div key={violation.message} className="violation">
            {violation.message}
            {violation.suggestion && (
              <button onClick={() => {/* Apply suggestion */}}>
                Apply: {violation.suggestion}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Performance Best Practices

### 1. Hook Selection
- Use `useScheduleDisplay` for read-only components
- Use `useScheduleEditor` for full editing capabilities
- Use `useScheduleManagement` when you need comprehensive monitoring

### 2. Memoization
```typescript
// Enable deep memoization for complex calculations
const { getCachedCalculation } = useSchedulePerformance(schedule, {
  memoizationConfig: {
    enableDeepMemo: true,
    renderOptimization: true
  }
});

// Cache expensive operations
const complexStats = getCachedCalculation('stats-key', () => {
  return calculateComplexStatistics(schedule);
});
```

### 3. Performance Monitoring
```typescript
// Track component performance
import { withRenderTracking } from '@/hooks';

export default withRenderTracking(MyComponent, 'MyComponent');

// Or use hook directly
function MyComponent() {
  const { trackRender } = usePerformanceMonitoring();
  
  useEffect(() => {
    const start = performance.now();
    return () => {
      trackRender('MyComponent', performance.now() - start);
    };
  });
}
```

### 4. Memory Management
```typescript
// Enable automatic memory monitoring
const { memoryMetrics, clearCache } = useSchedulePerformance(schedule, {
  trackMemoryUsage: true,
  performanceThresholds: {
    memoryWarning: 50 * 1024 * 1024 // 50MB
  },
  onPerformanceAlert: (alert) => {
    if (alert.type === 'memory' && alert.severity === 'warning') {
      clearCache(); // Clear caches to free memory
    }
  }
});
```

## Testing

All hooks include comprehensive test suites. Example test usage:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useScheduleManager } from '@/hooks';

test('should assign performer to role', async () => {
  const { result } = renderHook(() => useScheduleManager({
    scheduleId: 'test-schedule'
  }));

  act(() => {
    result.current.assignPerformer('show-1', 'Sarge', 'PHIL');
  });

  expect(result.current.scheduleState.assignments).toContainEqual({
    showId: 'show-1',
    role: 'Sarge',
    performer: 'PHIL'
  });
});
```

## TypeScript Support

All hooks are fully typed with comprehensive interfaces:

```typescript
interface UseScheduleManagerOptions {
  scheduleId?: string;
  enableAutoSave?: boolean;
  autoSaveIntervalMs?: number;
  enableOptimisticUpdates?: boolean;
  onStateChange?: (state: ScheduleState) => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fieldErrors: Record<string, string>;
}

interface PerformanceMetrics {
  renderTime: number;
  lastRenderTime: number;
  averageRenderTime: number;
  memoryUsage?: number;
  webVitals: WebVitalsMetrics;
  componentMetrics: Map<string, ComponentMetric>;
}
```

## Accessibility Features

- Real-time validation with screen reader announcements
- Keyboard navigation support in all interactive elements
- WCAG 2.1 AA compliant error messaging
- Focus management for form interactions
- High contrast support for validation states

## Browser Support

- Modern browsers with ES2020+ support
- Performance API for metrics (graceful degradation)
- Web Vitals API (optional, with fallbacks)
- Memory API (Chrome/Edge only, optional)

## Contributing

When adding new hooks:

1. Follow the established patterns for state management
2. Include comprehensive TypeScript interfaces
3. Add unit tests with >90% coverage
4. Include performance optimizations
5. Document with examples and best practices
6. Ensure accessibility compliance

## License

Part of the STOMP Performance Scheduler project.