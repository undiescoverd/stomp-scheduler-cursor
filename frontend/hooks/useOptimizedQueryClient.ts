import React, { useMemo, useCallback } from 'react';
import { QueryClient, QueryCache, MutationCache, useQueryClient, QueryState } from '@tanstack/react-query';
// import { PerformanceMonitor } from '../utils/performance';
import { toast } from '@/components/ui/use-toast';

// Query invalidation strategies
export interface InvalidationStrategy {
  scheduleUpdated: string[];
  assignmentChanged: string[];
  castMemberChanged: string[];
  companyChanged: string[];
}

// Cache optimization configuration
export interface CacheConfig {
  scheduleStaleTime: number;
  assignmentStaleTime: number;
  castMemberStaleTime: number;
  analyticsStaleTime: number;
  defaultRetry: number;
  backgroundRefetchInterval: number;
  maxCacheSize: number;
}

// Performance metrics for queries
export interface QueryPerformanceMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageQueryTime: number;
  cacheHitRate: number;
  backgroundRefetches: number;
}

// Default cache configuration optimized for schedule operations
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  scheduleStaleTime: 1000 * 60 * 5, // 5 minutes
  assignmentStaleTime: 1000 * 60 * 2, // 2 minutes (more dynamic)
  castMemberStaleTime: 1000 * 60 * 30, // 30 minutes (rarely changes)
  analyticsStaleTime: 1000 * 60 * 10, // 10 minutes
  defaultRetry: 2,
  backgroundRefetchInterval: 1000 * 60 * 15, // 15 minutes
  maxCacheSize: 50 // Max number of cached queries
};

// Invalidation strategies for different operations
const INVALIDATION_STRATEGIES: InvalidationStrategy = {
  scheduleUpdated: [
    'schedules',
    'schedule',
    'analytics',
    'utilization',
    'validation'
  ],
  assignmentChanged: [
    'schedule',
    'analytics',
    'validation',
    'utilization'
  ],
  castMemberChanged: [
    'cast-members',
    'company',
    'validation'
  ],
  companyChanged: [
    'company',
    'cast-members'
  ]
};

/**
 * Creates an optimized QueryClient with performance monitoring and cache strategies
 */
export function createOptimizedQueryClient(config: Partial<CacheConfig> = {}): QueryClient {
  const mergedConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
  const queryMetrics = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    queryTimes: [] as number[],
    cacheHits: 0,
    backgroundRefetches: 0
  };

  const queryCache = new QueryCache({
    onSuccess: (data, query) => {
      queryMetrics.successfulQueries++;
      
      // Track cache hits
      if (query.state.dataUpdatedAt < Date.now() - 1000) {
        queryMetrics.cacheHits++;
      }
      
      // PerformanceMonitor.endMeasurement(`query-${query.queryHash}`);
    },
    
    onError: (error, query) => {
      queryMetrics.failedQueries++;
      
      console.error('Query failed:', {
        queryKey: query.queryKey,
        error: error instanceof Error ? error.message : error
      });
      
      // Don't show toast for background refetch failures
      if (!query.state.fetchStatus || query.state.fetchFailureCount === 1) {
        toast({
          title: "Data Loading Error",
          description: error instanceof Error ? error.message : "Failed to load data",
          variant: "destructive"
        });
      }
      
      // PerformanceMonitor.endMeasurement(`query-${query.queryHash}`);
    },

    onSettled: (data, error, query) => {
      queryMetrics.totalQueries++;
      
      // Log performance metrics periodically
      if (queryMetrics.totalQueries % 10 === 0) {
        const successRate = (queryMetrics.successfulQueries / queryMetrics.totalQueries) * 100;
        const cacheHitRate = (queryMetrics.cacheHits / queryMetrics.totalQueries) * 100;
        
        console.log('📊 Query Performance:', {
          totalQueries: queryMetrics.totalQueries,
          successRate: `${successRate.toFixed(1)}%`,
          cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
          backgroundRefetches: queryMetrics.backgroundRefetches
        });
      }
    }
  });

  const mutationCache = new MutationCache({
    onSuccess: (data, variables, context, mutation) => {
      console.log('✅ Mutation succeeded:', mutation.options.mutationKey);
    },
    
    onError: (error, variables, context, mutation) => {
      console.error('❌ Mutation failed:', {
        mutationKey: mutation.options.mutationKey,
        error: error instanceof Error ? error.message : error
      });
      
      toast({
        title: "Operation Failed",
        description: error instanceof Error ? error.message : "Operation failed",
        variant: "destructive"
      });
    }
  });

  return new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: mergedConfig.scheduleStaleTime,
        retry: (failureCount, error) => {
          // Don't retry on 4xx errors
          if (error && typeof error === 'object' && 'status' in error) {
            const status = (error as any).status;
            if (status >= 400 && status < 500) {
              return false;
            }
          }
          return failureCount < mergedConfig.defaultRetry;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchInterval: false, // Disable automatic refetching by default
        networkMode: 'online',
        
        // Enhanced error handling
        throwOnError: false,
        
        // Remove onSettled as it's not valid in defaultOptions
      },
      
      mutations: {
        retry: 1,
        retryDelay: 1000,
        networkMode: 'online',
        throwOnError: false
      }
    }
  });
}

/**
 * Hook for optimized query client with performance monitoring
 */
export function useOptimizedQueryClient() {
  const queryClient = useQueryClient();
  
  // Smart invalidation based on operation type
  const invalidateQueries = useCallback(async (
    strategy: keyof InvalidationStrategy,
    specific?: string[]
  ) => {
    const patterns = specific || INVALIDATION_STRATEGIES[strategy];
    
    // PerformanceMonitor.startMeasurement('cache-invalidation', {
    //   strategy,
    //   patterns: patterns.length
    // });
    
    try {
      await Promise.all(
        patterns.map(pattern => 
          queryClient.invalidateQueries({
            queryKey: [pattern],
            exact: false
          })
        )
      );
      
      // PerformanceMonitor.endMeasurement('cache-invalidation');
    } catch (error) {
      // PerformanceMonitor.endMeasurement('cache-invalidation');
      console.error('Cache invalidation failed:', error);
    }
  }, [queryClient]);

  // Optimistic cache updates
  const updateCache = useCallback(<T>(
    queryKey: (string | number)[],
    updater: (oldData: T | undefined) => T
  ) => {
    queryClient.setQueryData(queryKey, updater);
  }, [queryClient]);

  // Prefetch related data
  const prefetchRelatedData = useCallback(async (scheduleId: string) => {
    const prefetchPromises = [
      queryClient.prefetchQuery({
        queryKey: ['schedule', scheduleId],
        staleTime: DEFAULT_CACHE_CONFIG.scheduleStaleTime
      }),
      queryClient.prefetchQuery({
        queryKey: ['cast-members'],
        staleTime: DEFAULT_CACHE_CONFIG.castMemberStaleTime
      }),
      queryClient.prefetchQuery({
        queryKey: ['exportData', scheduleId],
        staleTime: DEFAULT_CACHE_CONFIG.analyticsStaleTime
      })
    ];

    try {
      await Promise.all(prefetchPromises);
    } catch (error) {
      console.warn('Prefetch failed:', error);
    }
  }, [queryClient]);

  // Cache size management
  const manageCacheSize = useCallback(() => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    if (queries.length > DEFAULT_CACHE_CONFIG.maxCacheSize) {
      // Remove oldest inactive queries
      const sortedQueries = queries
        .filter(query => !query.getObserversCount()) // Only inactive queries
        .sort((a, b) => (a.state.dataUpdatedAt || 0) - (b.state.dataUpdatedAt || 0));
      
      const toRemove = sortedQueries.slice(0, queries.length - DEFAULT_CACHE_CONFIG.maxCacheSize);
      toRemove.forEach(query => {
        cache.remove(query);
      });
      
      console.log(`🧹 Cleaned up ${toRemove.length} stale cache entries`);
    }
  }, [queryClient]);

  // Background refresh for critical data
  const refreshCriticalData = useCallback(async () => {
    const criticalQueries = [
      ['schedules'],
      ['cast-members'],
      ['company']
    ];

    try {
      await Promise.all(
        criticalQueries.map(queryKey =>
          queryClient.refetchQueries({
            queryKey,
            type: 'active'
          })
        )
      );
    } catch (error) {
      console.warn('Background refresh failed:', error);
    }
  }, [queryClient]);

  // Performance monitoring
  const getPerformanceMetrics = useCallback((): QueryPerformanceMetrics => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    const successful = queries.filter(q => q.state.status === 'success').length;
    const failed = queries.filter(q => q.state.status === 'error').length;
    const total = queries.length;
    
    // Calculate cache hit rate (approximation)
    const recentQueries = queries.filter(q => 
      (q.state.dataUpdatedAt || 0) > Date.now() - 60000 // Last minute
    );
    const cacheHits = recentQueries.filter(q => 
      q.state.dataUpdatedAt && q.state.dataUpdatedAt < Date.now() - 1000
    ).length;
    
    return {
      totalQueries: total,
      successfulQueries: successful,
      failedQueries: failed,
      averageQueryTime: 0, // Would need more sophisticated tracking
      cacheHitRate: recentQueries.length > 0 ? (cacheHits / recentQueries.length) * 100 : 0,
      backgroundRefetches: 0 // Would need tracking in query callbacks
    };
  }, [queryClient]);

  // Request deduplication helper
  const deduplicateRequests = useCallback(<T>(
    queryKey: (string | number)[],
    queryFn: () => Promise<T>,
    options?: { staleTime?: number }
  ) => {
    return queryClient.fetchQuery({
      queryKey,
      queryFn,
      staleTime: options?.staleTime || DEFAULT_CACHE_CONFIG.scheduleStaleTime
    });
  }, [queryClient]);

  // Memory management
  const clearExpiredCache = useCallback(() => {
    const cache = queryClient.getQueryCache();
    const now = Date.now();
    
    cache.getAll().forEach(query => {
      const { dataUpdatedAt } = query.state;
      const staleTime = DEFAULT_CACHE_CONFIG.scheduleStaleTime;
      
      if (dataUpdatedAt && now - dataUpdatedAt > staleTime * 3) {
        // Remove data that's significantly stale
        cache.remove(query);
      }
    });
  }, [queryClient]);

  // Auto-cleanup effect
  React.useEffect(() => {
    const cleanup = setInterval(() => {
      manageCacheSize();
      clearExpiredCache();
    }, 1000 * 60 * 5); // Every 5 minutes

    return () => clearInterval(cleanup);
  }, [manageCacheSize, clearExpiredCache]);

  // Background refresh effect
  React.useEffect(() => {
    const backgroundRefresh = setInterval(() => {
      refreshCriticalData();
    }, DEFAULT_CACHE_CONFIG.backgroundRefetchInterval);

    return () => clearInterval(backgroundRefresh);
  }, [refreshCriticalData]);

  return {
    // Smart invalidation
    invalidateQueries,
    
    // Cache management
    updateCache,
    prefetchRelatedData,
    manageCacheSize,
    clearExpiredCache,
    
    // Performance
    getPerformanceMetrics,
    deduplicateRequests,
    
    // Background operations
    refreshCriticalData,
    
    // Direct access to query client
    queryClient
  };
}

/**
 * Hook for specific query optimization strategies
 */
export function useQueryOptimization(queryKey: (string | number)[]) {
  const queryClient = useQueryClient();
  
  // Check if query is currently fetching
  const isFetching = useMemo(() => {
    return queryClient.isFetching({ queryKey });
  }, [queryClient, queryKey]);

  // Get query state
  const queryState = useMemo(() => {
    const query = queryClient.getQueryState(queryKey);
    return {
      isStale: query ? Date.now() - (query.dataUpdatedAt || 0) > DEFAULT_CACHE_CONFIG.scheduleStaleTime : true,
      lastFetch: query?.dataUpdatedAt,
      errorCount: query?.fetchFailureCount || 0,
      status: query?.status || 'idle'
    };
  }, [queryClient, queryKey]);

  // Optimized refetch with conditions
  const optimizedRefetch = useCallback(async (force = false) => {
    const state = queryClient.getQueryState(queryKey);
    
    // Don't refetch if already fetching or recently fetched (unless forced)
    if (!force) {
      if (queryClient.isFetching({ queryKey })) return;
      
      const timeSinceLastFetch = Date.now() - (state?.dataUpdatedAt || 0);
      if (timeSinceLastFetch < 10000) return; // 10 seconds minimum
    }

    return queryClient.refetchQueries({ queryKey, exact: true });
  }, [queryClient, queryKey]);

  return {
    isFetching,
    queryState,
    optimizedRefetch
  };
}

