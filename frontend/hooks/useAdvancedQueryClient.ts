/**
 * Advanced Query Client with comprehensive caching, persistence, and performance optimization
 * Integrates all caching strategies, offline support, and intelligent invalidation
 */

import React, { useMemo, useCallback, useEffect } from 'react';
import { QueryClient, QueryCache, MutationCache, useQueryClient, QueryKey } from '@tanstack/react-query';
// import { PerformanceMonitor } from '../utils/performance';
import { getCacheStrategy, getInvalidationPatterns, AdaptiveCacheStrategy } from '../utils/cache/cacheStrategies';
import { persistentCache } from '../utils/cache/persistentCache';
import { OfflineManager } from '../utils/cache/offlineManager';
import { makeNetworkRequest } from '../utils/cache/queryClientIntegration';
import { toast } from '@/components/ui/use-toast';

// Enhanced cache configuration with adaptive settings
export interface AdvancedCacheConfig {
  enablePersistence: boolean;
  enableOfflineSupport: boolean;
  enableAdaptiveStrategies: boolean;
  enablePerformanceMonitoring: boolean;
  enableRequestDeduplication: boolean;
  maxMemoryCacheSize: number;
  persistentCacheSize: number;
  backgroundRefreshEnabled: boolean;
  conflictResolutionStrategy: 'local' | 'server' | 'merge' | 'newest';
}

// Performance analytics for query operations
export interface QueryAnalytics {
  queryMetrics: {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageResponseTime: number;
    cacheHitRate: number;
    networkRequests: number;
    backgroundRefetches: number;
  };
  cacheMetrics: {
    memoryUsage: number;
    persistentStorageUsage: number;
    entriesCount: number;
    evictionsCount: number;
    hitRate: number;
    missRate: number;
  };
  networkMetrics: {
    bytesTransferred: number;
    requestsPerMinute: number;
    averageLatency: number;
    timeoutsCount: number;
    retriesCount: number;
  };
}

// Default advanced configuration
const DEFAULT_ADVANCED_CONFIG: AdvancedCacheConfig = {
  enablePersistence: true,
  enableOfflineSupport: true,
  enableAdaptiveStrategies: true,
  enablePerformanceMonitoring: true,
  enableRequestDeduplication: true,
  maxMemoryCacheSize: 100,
  persistentCacheSize: 50 * 1024 * 1024, // 50MB
  backgroundRefreshEnabled: true,
  conflictResolutionStrategy: 'newest'
};

/**
 * Creates an advanced QueryClient with all optimization features
 */
export function createAdvancedQueryClient(config: Partial<AdvancedCacheConfig> = {}): QueryClient {
  const mergedConfig = { ...DEFAULT_ADVANCED_CONFIG, ...config };
  
  // Analytics tracking
  const analytics = {
    queryMetrics: {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      responseTimes: [] as number[],
      cacheHits: 0,
      networkRequests: 0,
      backgroundRefetches: 0
    },
    networkMetrics: {
      bytesTransferred: 0,
      requestsCount: 0,
      timeouts: 0,
      retries: 0,
      latencies: [] as number[]
    }
  };

  // Request deduplication map
  const activeRequests = new Map<string, Promise<any>>();

  // Performance-enhanced QueryCache
  const queryCache = new QueryCache({
    onSuccess: async (data, query) => {
      analytics.queryMetrics.successfulQueries++;
      
      // Track performance
      // const measurement = PerformanceMonitor.endMeasurement(`query-${query.queryHash}`);
      // if (measurement > 0) {
      //   analytics.queryMetrics.responseTimes.push(measurement);
      // }
      
      // Adaptive strategy tracking
      if (mergedConfig.enableAdaptiveStrategies) {
        AdaptiveCacheStrategy.trackAccess(query.queryKey as string[]);
      }
      
      // Store in persistent cache if enabled
      if (mergedConfig.enablePersistence && data) {
        const strategy = getCacheStrategy(query.queryKey as string[]);
        await persistentCache.store(query.queryKey, data, {
          staleTime: strategy.staleTime,
          cacheTime: strategy.cacheTime,
          tags: strategy.tags
        }).catch(error => {
          console.warn('Failed to persist cache:', error);
        });
      }
      
      // Track cache hit if data was served from cache
      const timeSinceUpdate = Date.now() - (query.state.dataUpdatedAt || 0);
      if (timeSinceUpdate > 1000) {
        analytics.queryMetrics.cacheHits++;
      } else {
        analytics.queryMetrics.networkRequests++;
      }
    },
    
    onError: (error, query) => {
      analytics.queryMetrics.failedQueries++;
      // PerformanceMonitor.endMeasurement(`query-${query.queryHash}`);
      
      // Enhanced error handling
      const isNetworkError = error instanceof Error && 
        (error.message.includes('fetch') || error.message.includes('network'));
      
      const isBackgroundRefetch = query.state.fetchStatus === 'fetching' && 
        query.getObserversCount() === 0;
      
      // Only show user-facing errors for non-background operations
      if (!isBackgroundRefetch) {
        toast({
          title: "Data Loading Error",
          description: isNetworkError 
            ? "Network connection issue. Please check your connection."
            : error instanceof Error ? error.message : "Failed to load data",
          variant: "destructive"
        });
      }
      
      console.error('Query failed:', {
        queryKey: query.queryKey,
        error: error instanceof Error ? error.message : error,
        isBackground: isBackgroundRefetch,
        retryCount: query.state.fetchFailureCount
      });
    },

    onSettled: (data, error, query) => {
      analytics.queryMetrics.totalQueries++;
      
      // Clean up active request tracking
      const requestKey = JSON.stringify(query.queryKey);
      activeRequests.delete(requestKey);
      
      // Log performance periodically
      if (analytics.queryMetrics.totalQueries % 25 === 0) {
        logAnalytics(analytics);
      }
    }
  });

  // Enhanced MutationCache with offline support
  const mutationCache = new MutationCache({
    onSuccess: (data, variables, context, mutation) => {
      console.log('✅ Mutation succeeded:', mutation.options.mutationKey);
      
      // Smart cache invalidation based on mutation type
      if (mutation.options.mutationKey) {
        const patterns = getInvalidationPatterns(mutation.options.mutationKey[0] as string);
        
        // Invalidate related queries
        patterns.forEach(pattern => {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const keyStr = query.queryKey.join(':');
              return keyStr.includes(pattern);
            }
          });
        });
        
        // Remove related persistent cache entries
        if (mergedConfig.enablePersistence) {
          persistentCache.removeByTags(patterns).catch(error => {
            console.warn('Failed to invalidate persistent cache:', error);
          });
        }
      }
    },
    
    onError: (error, variables, context, mutation) => {
      console.error('❌ Mutation failed:', {
        mutationKey: mutation.options.mutationKey,
        error: error instanceof Error ? error.message : error
      });
      
      // Queue for offline retry if enabled
      if (mergedConfig.enableOfflineSupport && mutation.options.mutationKey) {
        const offlineManager = (queryClient as any)._offlineManager as OfflineManager;
        if (offlineManager) {
          offlineManager.queueOperation({
            operation: 'mutation',
            mutationKey: mutation.options.mutationKey as string[],
            variables,
            maxRetries: 3,
            priority: 'high'
          });
        }
      }
      
      toast({
        title: "Operation Failed",
        description: error instanceof Error ? error.message : "Operation failed",
        variant: "destructive"
      });
    }
  });

  // Create QueryClient with enhanced configuration
  const queryClient = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        queryFn: async ({ queryKey, signal }) => {
          const requestKey = JSON.stringify(queryKey);
          
          // Request deduplication
          if (mergedConfig.enableRequestDeduplication && activeRequests.has(requestKey)) {
            console.log('🔄 Deduplicating request:', queryKey);
            return activeRequests.get(requestKey);
          }
          
          // Start performance measurement
          // PerformanceMonitor.startMeasurement(`query-${queryKey.join('-')}`);
          
          // Get cache strategy
          const strategy = mergedConfig.enableAdaptiveStrategies
            ? AdaptiveCacheStrategy.getAdaptiveStrategy(queryKey as string[])
            : getCacheStrategy(queryKey as string[]);
          
          // Try persistent cache first if enabled
          if (mergedConfig.enablePersistence) {
            const cached = await persistentCache.retrieve(queryKey);
            if (cached) {
              const age = Date.now() - cached.timestamp;
              if (age <= cached.metadata.staleTime) {
                console.log('🎯 Served from persistent cache:', queryKey);
                return cached.data;
              }
            }
          }
          
          // Make network request using integrated function
          const request = makeNetworkRequest(queryKey, signal);
          activeRequests.set(requestKey, request);
          
          return request;
        },
        
        // Dynamic options based on cache strategy
        staleTime: 5 * 60 * 1000, // 5 minutes default
        
        retry: (failureCount: number, error: unknown) => {
          
          // Don't retry 4xx errors
          if (error && typeof error === 'object' && 'status' in error) {
            const status = (error as any).status;
            if (status >= 400 && status < 500) {
              return false;
            }
          }
          
          // Network errors get more retries
          const isNetworkError = error instanceof Error && 
            (error.message.includes('fetch') || error.message.includes('network'));
          
          const maxRetries = isNetworkError ? 5 : 2;
          
          return failureCount < maxRetries;
        },
        
        retryDelay: (attemptIndex, error) => {
          const strategy = getCacheStrategy([]);
          
          if (typeof strategy.retryDelay === 'function') {
            return strategy.retryDelay(attemptIndex, error);
          }
          
          // Exponential backoff with jitter
          const baseDelay = 1000;
          const maxDelay = 30000;
          const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
          const jitter = Math.random() * 0.1 * exponentialDelay;
          
          return Math.min(exponentialDelay + jitter, maxDelay);
        },
        
        refetchOnWindowFocus: (query) => {
          const strategy = getCacheStrategy(query.queryKey as string[]);
          return strategy.refetchOnWindowFocus;
        },
        
        refetchOnReconnect: (query) => {
          const strategy = getCacheStrategy(query.queryKey as string[]);
          return strategy.refetchOnReconnect;
        },
        
        networkMode: 'online'
      },
      
      mutations: {
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 10000),
        networkMode: 'online'
      }
    }
  });

  // Initialize offline manager if enabled
  if (mergedConfig.enableOfflineSupport) {
    const offlineManager = new OfflineManager(queryClient);
    offlineManager.setConflictResolutionStrategy(mergedConfig.conflictResolutionStrategy);
    (queryClient as any)._offlineManager = offlineManager;
  }

  // Background refresh setup
  if (mergedConfig.backgroundRefreshEnabled) {
    setupBackgroundRefresh(queryClient);
  }

  return queryClient;
}

/**
 * Setup background refresh for critical data
 */
function setupBackgroundRefresh(queryClient: QueryClient): void {
  const refreshCriticalData = async () => {
    const criticalPatterns = ['schedule', 'assignment', 'company'];
    
    for (const pattern of criticalPatterns) {
      try {
        await queryClient.refetchQueries({
          predicate: (query) => {
            const keyStr = query.queryKey.join(':');
            return keyStr.includes(pattern) && query.getObserversCount() > 0;
          },
          type: 'active'
        });
      } catch (error) {
        console.warn(`Background refresh failed for ${pattern}:`, error);
      }
    }
  };

  // Refresh every 10 minutes
  setInterval(refreshCriticalData, 10 * 60 * 1000);
}

/**
 * Log analytics data
 */
function logAnalytics(analytics: any): void {
  const avgResponseTime = analytics.queryMetrics.responseTimes.length > 0
    ? analytics.queryMetrics.responseTimes.reduce((a: number, b: number) => a + b, 0) / analytics.queryMetrics.responseTimes.length
    : 0;
    
  const cacheHitRate = analytics.queryMetrics.totalQueries > 0
    ? (analytics.queryMetrics.cacheHits / analytics.queryMetrics.totalQueries) * 100
    : 0;

  console.log('📊 Query Analytics:', {
    totalQueries: analytics.queryMetrics.totalQueries,
    successRate: `${((analytics.queryMetrics.successfulQueries / analytics.queryMetrics.totalQueries) * 100).toFixed(1)}%`,
    avgResponseTime: `${avgResponseTime.toFixed(1)}ms`,
    cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
    networkRequests: analytics.queryMetrics.networkRequests
  });
}

/**
 * Hook for advanced query client functionality
 */
export function useAdvancedQueryClient() {
  const queryClient = useQueryClient();
  
  // Smart invalidation with relationship awareness
  const smartInvalidate = useCallback(async (
    operation: string,
    options: { immediate?: boolean; background?: boolean } = {}
  ) => {
    const patterns = getInvalidationPatterns(operation);
    
    // PerformanceMonitor.startMeasurement('cache-invalidation', {
    //   operation,
    //   patterns: patterns.length
    // });
    
    try {
      if (options.background) {
        // Background invalidation - don't await
        patterns.forEach(pattern => {
          queryClient.invalidateQueries({
            predicate: (query) => query.queryKey.join(':').includes(pattern),
            refetchType: 'none'
          });
        });
      } else {
        // Immediate invalidation with refetch
        await Promise.all(
          patterns.map(pattern =>
            queryClient.invalidateQueries({
              predicate: (query) => query.queryKey.join(':').includes(pattern),
              refetchType: options.immediate ? 'active' : 'all'
            })
          )
        );
      }
      
      // PerformanceMonitor.endMeasurement('cache-invalidation');
    } catch (error) {
      // PerformanceMonitor.endMeasurement('cache-invalidation');
      console.error('Smart invalidation failed:', error);
    }
  }, [queryClient]);

  // Optimistic updates with rollback
  const optimisticUpdate = useCallback(<T>(
    queryKey: QueryKey,
    updater: (oldData: T | undefined) => T,
    rollbackData?: T
  ) => {
    const previousData = queryClient.getQueryData<T>(queryKey);
    
    // Apply optimistic update
    queryClient.setQueryData(queryKey, updater);
    
    // Return rollback function
    return () => {
      queryClient.setQueryData(queryKey, rollbackData || previousData);
    };
  }, [queryClient]);

  // Prefetch with priority
  const priorityPrefetch = useCallback(async (
    queries: Array<{ queryKey: QueryKey; priority: 'high' | 'medium' | 'low' }>
  ) => {
    // Sort by priority
    const sortedQueries = queries.sort((a, b) => {
      const priorities = { high: 3, medium: 2, low: 1 };
      return priorities[b.priority] - priorities[a.priority];
    });
    
    // Execute high priority first, then others in parallel
    const highPriority = sortedQueries.filter(q => q.priority === 'high');
    const others = sortedQueries.filter(q => q.priority !== 'high');
    
    // Execute high priority queries first
    for (const query of highPriority) {
      try {
        await queryClient.prefetchQuery({ queryKey: query.queryKey });
      } catch (error) {
        console.warn('High priority prefetch failed:', error);
      }
    }
    
    // Execute others in parallel
    await Promise.allSettled(
      others.map(query =>
        queryClient.prefetchQuery({ queryKey: query.queryKey })
      )
    );
  }, [queryClient]);

  // Get comprehensive analytics
  const getAnalytics = useCallback(async (): Promise<QueryAnalytics> => {
    const cacheMetrics = await persistentCache.getMetrics();
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    const successful = queries.filter(q => q.state.status === 'success').length;
    const failed = queries.filter(q => q.state.status === 'error').length;
    
    return {
      queryMetrics: {
        totalQueries: queries.length,
        successfulQueries: successful,
        failedQueries: failed,
        averageResponseTime: 0, // Would need more sophisticated tracking
        cacheHitRate: cacheMetrics.hitRate,
        networkRequests: 0, // Would need tracking
        backgroundRefetches: 0 // Would need tracking
      },
      cacheMetrics: {
        memoryUsage: queries.length * 1000, // Rough estimate
        persistentStorageUsage: cacheMetrics.storageSize,
        entriesCount: cacheMetrics.entryCount,
        evictionsCount: 0, // Would need tracking
        hitRate: cacheMetrics.hitRate,
        missRate: cacheMetrics.missRate
      },
      networkMetrics: {
        bytesTransferred: 0, // Would need tracking
        requestsPerMinute: 0, // Would need tracking
        averageLatency: 0, // Would need tracking
        timeoutsCount: 0, // Would need tracking
        retriesCount: 0 // Would need tracking
      }
    };
  }, [queryClient]);

  // Memory management
  const optimizeMemory = useCallback(async () => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    // Remove inactive queries older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const toRemove = queries.filter(query => 
      !query.getObserversCount() && 
      (query.state.dataUpdatedAt || 0) < oneHourAgo
    );
    
    toRemove.forEach(query => cache.remove(query));
    
    console.log(`🧹 Removed ${toRemove.length} stale cache entries`);
    
    return {
      removedEntries: toRemove.length,
      remainingEntries: cache.getAll().length
    };
  }, [queryClient]);

  return {
    // Core functionality
    queryClient,
    
    // Smart operations
    smartInvalidate,
    optimisticUpdate,
    priorityPrefetch,
    
    // Analytics and monitoring
    getAnalytics,
    
    // Memory management
    optimizeMemory,
    
    // Offline support (if enabled)
    offlineManager: (queryClient as any)._offlineManager as OfflineManager | undefined
  };
}