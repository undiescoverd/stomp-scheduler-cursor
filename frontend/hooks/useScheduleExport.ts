import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend } from '../client';
// import { PerformanceMonitor } from '../utils/performance';
import { useToast } from '@/components/ui/use-toast';
import type { 
  Schedule,
  ExportDataResponse,
  CallSheetResponse,
  UtilizationReportResponse 
} from '~backend/scheduler/types';

// Export operation types
export type ExportFormat = 'pdf' | 'excel' | 'csv' | 'ical' | 'json';
export type ExportType = 'schedule' | 'callsheet' | 'utilization' | 'analytics';

// Export operation state
export interface ExportOperation {
  id: string;
  type: ExportType;
  format: ExportFormat;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startTime: Date;
  endTime?: Date;
  downloadUrl?: string;
  error?: string;
  metadata?: Record<string, any>;
}

// Export history entry
export interface ExportHistoryEntry {
  id: string;
  type: ExportType;
  format: ExportFormat;
  timestamp: Date;
  fileName: string;
  fileSize?: number;
  scheduleId: string;
  downloadCount: number;
  expiresAt?: Date;
}

// Export options
export interface ExportOptions {
  includeRedDays?: boolean;
  includeOffDays?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
  performers?: string[];
  roles?: string[];
  customFields?: Record<string, any>;
  template?: string;
  watermark?: boolean;
}

// Hook options
export interface UseScheduleExportOptions {
  scheduleId?: string;
  enableProgressTracking?: boolean;
  enableCaching?: boolean;
  cacheExpiryHours?: number;
  maxRetries?: number;
  onExportComplete?: (operation: ExportOperation) => void;
  onExportError?: (error: string) => void;
}

/**
 * Export operation management hook
 * Provides comprehensive export functionality with progress tracking, caching, and history
 */
export function useScheduleExport(options: UseScheduleExportOptions = {}) {
  const {
    scheduleId,
    enableProgressTracking = true,
    enableCaching = true,
    cacheExpiryHours = 24,
    maxRetries = 3,
    onExportComplete,
    onExportError
  } = options;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Export state management
  const [activeOperations, setActiveOperations] = useState<Map<string, ExportOperation>>(new Map());
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);
  const [exportCache, setExportCache] = useState<Map<string, { data: any; timestamp: Date }>>(new Map());
  
  const operationCounterRef = useRef<number>(0);
  const progressIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Fetch export data from backend
  const { data: exportData, isLoading: isLoadingExportData } = useQuery({
    queryKey: ['exportData', scheduleId],
    queryFn: async () => {
      // PerformanceMonitor.startMeasurement('export-data-fetch', { scheduleId });
      try {
        const response = await backend.scheduler.getExportData(scheduleId!);
        // PerformanceMonitor.endMeasurement('export-data-fetch');
        return response;
      } catch (error) {
        // PerformanceMonitor.endMeasurement('export-data-fetch');
        throw error;
      }
    },
    enabled: !!scheduleId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });

  // Call sheet generation mutation
  const callSheetMutation = useMutation({
    mutationFn: async ({ performerName }: { performerName: string }) => {
      // PerformanceMonitor.startMeasurement('callsheet-generation', { performerName });
      try {
        const response = await backend.scheduler.generateCallSheet(scheduleId!, performerName);
        // PerformanceMonitor.endMeasurement('callsheet-generation');
        return response;
      } catch (error) {
        // PerformanceMonitor.endMeasurement('callsheet-generation');
        throw error;
      }
    },
    retry: maxRetries
  });

  // Utilization report generation mutation
  const utilizationReportMutation = useMutation({
    mutationFn: async () => {
      // PerformanceMonitor.startMeasurement('utilization-report-generation');
      try {
        const response = await backend.scheduler.generateUtilizationReport(scheduleId!);
        // PerformanceMonitor.endMeasurement('utilization-report-generation');
        return response;
      } catch (error) {
        // PerformanceMonitor.endMeasurement('utilization-report-generation');
        throw error;
      }
    },
    retry: maxRetries
  });

  // Create export operation
  const createExportOperation = useCallback((
    type: ExportType,
    format: ExportFormat,
    options?: ExportOptions
  ): ExportOperation => {
    const operationId = `export-${++operationCounterRef.current}-${Date.now()}`;
    
    const operation: ExportOperation = {
      id: operationId,
      type,
      format,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
      metadata: {
        scheduleId,
        options
      }
    };

    setActiveOperations(prev => new Map(prev).set(operationId, operation));
    return operation;
  }, [scheduleId]);

  // Update export operation
  const updateExportOperation = useCallback((
    operationId: string,
    updates: Partial<ExportOperation>
  ) => {
    setActiveOperations(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(operationId);
      if (existing) {
        const updated = { ...existing, ...updates };
        newMap.set(operationId, updated);
        
        // Handle completion
        if (updated.status === 'completed') {
          onExportComplete?.(updated);
          
          // Add to history
          setExportHistory(prevHistory => {
            const historyEntry: ExportHistoryEntry = {
              id: operationId,
              type: updated.type,
              format: updated.format,
              timestamp: updated.endTime || new Date(),
              fileName: `${updated.type}-${updated.format}-${Date.now()}`,
              scheduleId: scheduleId!,
              downloadCount: 0,
              expiresAt: new Date(Date.now() + cacheExpiryHours * 60 * 60 * 1000)
            };
            return [historyEntry, ...prevHistory].slice(0, 50); // Keep last 50 exports
          });
        }
        
        // Handle errors
        if (updated.status === 'failed' && updated.error) {
          onExportError?.(updated.error);
        }
      }
      return newMap;
    });
  }, [onExportComplete, onExportError, scheduleId, cacheExpiryHours]);

  // Progress tracking simulation
  const simulateProgress = useCallback((operationId: string, duration: number = 3000) => {
    if (!enableProgressTracking) return;

    const interval = setInterval(() => {
      setActiveOperations(prev => {
        const newMap = new Map(prev);
        const operation = newMap.get(operationId);
        if (operation && operation.status === 'processing') {
          const elapsed = Date.now() - operation.startTime.getTime();
          const progress = Math.min(95, (elapsed / duration) * 100);
          newMap.set(operationId, { ...operation, progress });
        }
        return newMap;
      });
    }, 100);

    progressIntervalsRef.current.set(operationId, interval);

    // Clear interval after duration
    setTimeout(() => {
      const intervalId = progressIntervalsRef.current.get(operationId);
      if (intervalId) {
        clearInterval(intervalId);
        progressIntervalsRef.current.delete(operationId);
      }
    }, duration);
  }, [enableProgressTracking]);

  // Generate PDF from data
  const generatePDF = useCallback(async (
    data: any,
    type: ExportType,
    options?: ExportOptions
  ): Promise<Blob> => {
    // This would integrate with jsPDF or similar library
    // For now, we'll simulate the PDF generation
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    switch (type) {
      case 'schedule':
        doc.text('Schedule Export', 20, 20);
        if (data.schedule) {
          doc.text(`Location: ${data.schedule.location}`, 20, 40);
          doc.text(`Week: ${data.schedule.week}`, 20, 60);
          // Add schedule grid data
          data.schedule.shows.forEach((show: any, index: number) => {
            doc.text(`${show.date} ${show.time}`, 20, 80 + index * 20);
          });
        }
        break;
        
      case 'callsheet':
        doc.text('Call Sheet', 20, 20);
        if (data.performerName) {
          doc.text(`Performer: ${data.performerName}`, 20, 40);
          doc.text(`Location: ${data.location}`, 20, 60);
          doc.text(`Week: ${data.week}`, 20, 80);
          // Add show details
          data.shows.forEach((show: any, index: number) => {
            doc.text(`${show.date} ${show.time} - ${show.role || 'OFF'}`, 20, 100 + index * 20);
          });
        }
        break;
        
      case 'utilization':
        doc.text('Utilization Report', 20, 20);
        if (data.performerUtilization) {
          data.performerUtilization.forEach((util: any, index: number) => {
            doc.text(
              `${util.performer}: ${util.utilizationRate}% (${util.performingShows}/${util.totalShows})`,
              20,
              40 + index * 20
            );
          });
        }
        break;
    }
    
    return new Blob([doc.output('blob')], { type: 'application/pdf' });
  }, []);

  // Generate Excel from data
  const generateExcel = useCallback(async (
    data: any,
    type: ExportType,
    options?: ExportOptions
  ): Promise<Blob> => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    
    switch (type) {
      case 'schedule':
        if (data.schedule) {
          // Create shows worksheet
          const showsWS = XLSX.utils.json_to_sheet(data.schedule.shows);
          XLSX.utils.book_append_sheet(workbook, showsWS, 'Shows');
          
          // Create assignments worksheet
          const assignmentsWS = XLSX.utils.json_to_sheet(data.schedule.assignments);
          XLSX.utils.book_append_sheet(workbook, assignmentsWS, 'Assignments');
        }
        break;
        
      case 'callsheet':
        const callSheetWS = XLSX.utils.json_to_sheet(data.shows || []);
        XLSX.utils.book_append_sheet(workbook, callSheetWS, 'Call Sheet');
        break;
        
      case 'utilization':
        if (data.performerUtilization) {
          const utilizationWS = XLSX.utils.json_to_sheet(data.performerUtilization);
          XLSX.utils.book_append_sheet(workbook, utilizationWS, 'Utilization');
        }
        break;
    }
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }, []);

  // Generate iCal from schedule data
  const generateICal = useCallback(async (
    data: any,
    options?: ExportOptions
  ): Promise<Blob> => {
    const ical = await import('ical-generator');
    const calendar = ical.default({ name: `Schedule - ${data.schedule?.location || 'Unknown'}` });
    
    if (data.schedule?.shows) {
      data.schedule.shows.forEach((show: any) => {
        if (show.status === 'show') {
          const startDate = new Date(`${show.date}T${show.time}`);
          const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000); // Assume 2-hour shows
          
          calendar.createEvent({
            start: startDate,
            end: endDate,
            summary: `Performance - ${data.schedule.location}`,
            description: `Call Time: ${show.callTime}`,
            location: data.schedule.location
          });
        }
      });
    }
    
    return new Blob([calendar.toString()], { type: 'text/calendar' });
  }, []);

  // Main export function
  const exportSchedule = useCallback(async (
    type: ExportType,
    format: ExportFormat,
    exportOptions?: ExportOptions
  ) => {
    if (!scheduleId) {
      throw new Error('Schedule ID is required for export');
    }

    const operation = createExportOperation(type, format, exportOptions);
    
    try {
      // Check cache first
      const cacheKey = `${scheduleId}-${type}-${format}-${JSON.stringify(exportOptions)}`;
      if (enableCaching && exportCache.has(cacheKey)) {
        const cached = exportCache.get(cacheKey)!;
        const age = Date.now() - cached.timestamp.getTime();
        if (age < cacheExpiryHours * 60 * 60 * 1000) {
          updateExportOperation(operation.id, {
            status: 'completed',
            progress: 100,
            endTime: new Date(),
            downloadUrl: URL.createObjectURL(cached.data)
          });
          return operation;
        }
      }

      updateExportOperation(operation.id, { status: 'processing' });
      simulateProgress(operation.id);

      let data: any;
      let blob: Blob;

      // Get data based on export type
      switch (type) {
        case 'schedule':
          data = exportData;
          break;
          
        case 'callsheet':
          if (!exportOptions?.performers?.length) {
            throw new Error('Performer selection required for call sheet export');
          }
          data = await callSheetMutation.mutateAsync({ 
            performerName: exportOptions.performers[0] 
          });
          break;
          
        case 'utilization':
          data = await utilizationReportMutation.mutateAsync();
          break;
          
        case 'analytics':
          // This would fetch analytics data
          data = exportData;
          break;
          
        default:
          throw new Error(`Unsupported export type: ${type}`);
      }

      // Generate file based on format
      switch (format) {
        case 'pdf':
          blob = await generatePDF(data, type, exportOptions);
          break;
          
        case 'excel':
          blob = await generateExcel(data, type, exportOptions);
          break;
          
        case 'csv':
          // Simple CSV generation - would need more sophisticated implementation
          const csvData = JSON.stringify(data, null, 2);
          blob = new Blob([csvData], { type: 'text/csv' });
          break;
          
        case 'ical':
          if (type !== 'schedule') {
            throw new Error('iCal format only supported for schedule exports');
          }
          blob = await generateICal(data, exportOptions);
          break;
          
        case 'json':
          blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          break;
          
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // Cache the result
      if (enableCaching) {
        setExportCache(prev => {
          const newCache = new Map(prev);
          newCache.set(cacheKey, { data: blob, timestamp: new Date() });
          
          // Limit cache size to 50 entries
          if (newCache.size > 50) {
            const firstKey = newCache.keys().next().value as string;
            newCache.delete(firstKey);
          }
          
          return newCache;
        });
      }

      const downloadUrl = URL.createObjectURL(blob);

      updateExportOperation(operation.id, {
        status: 'completed',
        progress: 100,
        endTime: new Date(),
        downloadUrl
      });

      // Auto-download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${type}-${format}-${Date.now()}.${format === 'excel' ? 'xlsx' : format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export Complete",
        description: `${type} exported as ${format.toUpperCase()}`,
        variant: "default"
      });

      return operation;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      
      updateExportOperation(operation.id, {
        status: 'failed',
        error: errorMessage,
        endTime: new Date()
      });

      toast({
        title: "Export Failed",
        description: errorMessage,
        variant: "destructive"
      });

      throw error;
    }
  }, [
    scheduleId,
    exportData,
    createExportOperation,
    updateExportOperation,
    simulateProgress,
    enableCaching,
    cacheExpiryHours,
    exportCache,
    callSheetMutation,
    utilizationReportMutation,
    generatePDF,
    generateExcel,
    generateICal,
    toast
  ]);

  // Quick export functions
  const exportAsPDF = useCallback((type: ExportType, options?: ExportOptions) =>
    exportSchedule(type, 'pdf', options), [exportSchedule]);

  const exportAsExcel = useCallback((type: ExportType, options?: ExportOptions) =>
    exportSchedule(type, 'excel', options), [exportSchedule]);

  const exportAsICal = useCallback((options?: ExportOptions) =>
    exportSchedule('schedule', 'ical', options), [exportSchedule]);

  // Cancel export operation
  const cancelExport = useCallback((operationId: string) => {
    const interval = progressIntervalsRef.current.get(operationId);
    if (interval) {
      clearInterval(interval);
      progressIntervalsRef.current.delete(operationId);
    }

    updateExportOperation(operationId, {
      status: 'failed',
      error: 'Cancelled by user',
      endTime: new Date()
    });
  }, [updateExportOperation]);

  // Clear export history
  const clearHistory = useCallback(() => {
    setExportHistory([]);
    setExportCache(new Map());
  }, []);

  // Get export metrics
  const exportMetrics = useMemo(() => {
    const total = exportHistory.length;
    const successful = exportHistory.filter(h => 
      !activeOperations.get(h.id) || activeOperations.get(h.id)?.status === 'completed'
    ).length;
    const failed = exportHistory.filter(h => 
      activeOperations.get(h.id)?.status === 'failed'
    ).length;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      activeCount: Array.from(activeOperations.values()).filter(op => 
        op.status === 'processing' || op.status === 'pending'
      ).length
    };
  }, [exportHistory, activeOperations]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      progressIntervalsRef.current.forEach(interval => clearInterval(interval));
      progressIntervalsRef.current.clear();
    };
  }, []);

  return {
    // Export functions
    exportSchedule,
    exportAsPDF,
    exportAsExcel,
    exportAsICal,
    
    // Operation management
    activeOperations: Array.from(activeOperations.values()),
    cancelExport,
    
    // History and caching
    exportHistory,
    clearHistory,
    exportMetrics,
    
    // Status
    isExporting: Array.from(activeOperations.values()).some(op => 
      op.status === 'processing' || op.status === 'pending'
    ),
    isLoadingData: isLoadingExportData,
    
    // Data
    exportData,
    
    // Errors
    exportError: callSheetMutation.error || utilizationReportMutation.error
  };
}
