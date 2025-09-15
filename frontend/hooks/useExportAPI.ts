import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

// Types for export API responses - these should match backend types
export interface ExportDataResponse {
  schedule: {
    id: string;
    location: string;
    week: string;
    shows: any[];
    assignments: any[];
    createdAt: Date;
    updatedAt: Date;
  };
  castMembers: any[];
  roles: string[];
  exportMetadata: {
    exportedAt: Date;
    exportedBy?: string;
  };
}

export interface CallSheetResponse {
  performerName: string;
  location: string;
  week: string;
  shows: Array<{
    date: string;
    time: string;
    callTime: string;
    status: string;
    role?: string;
    isRedDay?: boolean;
  }>;
  metadata: {
    generatedAt: Date;
    totalShows: number;
    performingShows: number;
    offDays: number;
    redDays: number;
  };
}

export interface UtilizationReportResponse {
  location: string;
  week: string;
  performerUtilization: Array<{
    performer: string;
    totalShows: number;
    performingShows: number;
    utilizationRate: number;
    redDays: number;
    roles: string[];
  }>;
  roleUtilization: Array<{
    role: string;
    coverage: Array<{
      showDate: string;
      performer: string | null;
      isCovered: boolean;
    }>;
    coverageRate: number;
  }>;
  metadata: {
    generatedAt: Date;
    totalShows: number;
    activeShows: number;
    averageUtilization: number;
  };
}

export const useExportAPI = () => {
  const { toast } = useToast();

  // Fetch export data for a schedule
  const useExportData = (scheduleId: string) => {
    return useQuery({
      queryKey: ['exportData', scheduleId],
      queryFn: async (): Promise<ExportDataResponse> => {
        const response = await fetch(`http://localhost:4000/schedules/${scheduleId}/export`);
        if (!response.ok) {
          throw new Error('Failed to fetch export data');
        }
        return response.json();
      },
      enabled: !!scheduleId,
    });
  };

  // Generate call sheet data
  const useCallSheet = () => {
    return useMutation({
      mutationFn: async ({ 
        scheduleId, 
        performerName 
      }: { 
        scheduleId: string; 
        performerName: string; 
      }): Promise<CallSheetResponse> => {
        const response = await fetch(
          `http://localhost:4000/schedules/${scheduleId}/callsheet/${performerName}`
        );
        if (!response.ok) {
          throw new Error('Failed to generate call sheet');
        }
        return response.json();
      },
      onError: (error) => {
        toast({
          title: "API Error",
          description: error instanceof Error ? error.message : "Failed to generate call sheet",
          variant: "destructive"
        });
      }
    });
  };

  // Generate utilization report
  const useUtilizationReport = () => {
    return useMutation({
      mutationFn: async (scheduleId: string): Promise<UtilizationReportResponse> => {
        const response = await fetch(`http://localhost:4000/schedules/${scheduleId}/utilization`);
        if (!response.ok) {
          throw new Error('Failed to generate utilization report');
        }
        return response.json();
      },
      onError: (error) => {
        toast({
          title: "API Error",
          description: error instanceof Error ? error.message : "Failed to generate utilization report",
          variant: "destructive"
        });
      }
    });
  };

  return {
    useExportData,
    useCallSheet,
    useUtilizationReport,
  };
};