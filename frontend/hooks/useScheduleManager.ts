import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backend } from '../client';
import { useToast } from '@/components/ui/use-toast';
import type { Schedule, Show, Assignment, Role, DayStatus } from '~backend/scheduler/types';
import type { ScheduleContextValue } from '../contexts/ScheduleContext';

export type ScheduleState = ReturnType<typeof useScheduleManager>;
export type AssignmentChange = Parameters<ReturnType<typeof useScheduleManager>['handleAssignmentChange']>;
export type ValidationResult = any; // Placeholder, will define later
export interface UseScheduleManagerOptions {
  scheduleId?: string;
  enableAutoSave?: boolean;
  autoSaveIntervalMs?: number;
  enableOptimisticUpdates?: boolean;
  onStateChange?: (state: ScheduleContextValue) => void;
}

export const useScheduleManager = (options?: UseScheduleManagerOptions): ScheduleContextValue => {
  const { scheduleId, enableAutoSave, autoSaveIntervalMs, enableOptimisticUpdates, onStateChange } = options || {};
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [location, setLocation] = useState('');
  const [week, setWeek] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [shows, setShows] = useState<Show[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const isEditing = Boolean(id);

  // Queries
  const { data: scheduleData, isLoading, error: scheduleError } = useQuery({
    queryKey: ['schedule', id],
    queryFn: () => backend.scheduler.get(id!),
    enabled: isEditing,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const { data: castData, error: castError } = useQuery({
    queryKey: ['cast-members'],
    queryFn: () => backend.scheduler.getCastMembers(),
    staleTime: 10 * 60 * 1000,
    retry: 1
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { location: string; week: string; shows: Show[] }) =>
      backend.scheduler.create(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      navigate(`/schedule/${response.schedule.id}`);
      toast({
        title: "Success",
        description: "Schedule created successfully"
      });
    },
    onError: (error) => {
      console.error('Failed to create schedule:', error);
      toast({
        title: "Error",
        description: "Failed to create schedule",
        variant: "destructive"
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; location?: string; week?: string; shows?: Show[]; assignments?: Assignment[] }) =>
      backend.scheduler.update(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', id] });
      toast({
        title: "Success",
        description: "Schedule saved successfully"
      });
    },
    onError: (error) => {
      console.error('Failed to update schedule:', error);
      toast({
        title: "Error",
        description: "Failed to save schedule",
        variant: "destructive"
      });
    }
  });

  const autoGenerateMutation = useMutation({
    mutationFn: (shows: Show[]) => backend.scheduler.autoGenerate({ shows }),
    onSuccess: (response) => {
      if (response.success) {
        setAssignments(response.assignments);
        
        // Check for critical violations in the response
        const stageAssignments = response.assignments.filter(a => a.role !== "OFF");
        const performerShowCounts = new Map<string, number>();
        
        // Quick check for consecutive shows or overwork
        stageAssignments.forEach(assignment => {
          const count = performerShowCounts.get(assignment.performer) || 0;
          performerShowCounts.set(assignment.performer, count + 1);
        });
        
        const maxShows = Math.max(...Array.from(performerShowCounts.values()));
        if (maxShows > 6) {
          toast({
            title: "Warning",
            description: `Schedule generated but some performers may be overworked (${maxShows} shows max)`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Success",
            description: "Schedule generated successfully with improved constraints"
          });
        }
      } else {
        toast({
          title: "Generation Failed",
          description: response.errors?.[0] || "Could not generate a valid schedule",
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      console.error('Failed to generate schedule:', error);
      toast({
        title: "Error",
        description: "Failed to generate schedule",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsGenerating(false);
    }
  });

  // Helper functions
  const getNextMonday = useCallback((fromDate = new Date()): Date => {
    const date = new Date(fromDate);
    const day = date.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day; // 0 = Sunday
    if (day === 1) { // If it's already Monday
      return date;
    }
    date.setDate(date.getDate() + daysUntilMonday);
    return date;
  }, []);

  const getWeekNumberFromDate = useCallback((date: Date): number => {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  }, []);

  const formatDateForInput = useCallback((date: Date): string => {
    return date.toISOString().split('T')[0];
  }, []);

  const generateShowsFromWeekStart = useCallback((weekStartDate: string): Show[] => {
    const startDate = new Date(weekStartDate);
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

    const defaultShows: Show[] = [
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 1 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '19:00', status: 'show' }, // Tuesday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '19:00', status: 'show' }, // Wednesday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '19:00', status: 'show' }, // Thursday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 4 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '18:00', status: 'show' }, // Friday
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000)), time: '16:00', callTime: '14:00', status: 'show' }, // Saturday matinee
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000)), time: '21:00', callTime: '18:00', status: 'show' }, // Saturday evening
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)), time: '16:00', callTime: '14:30', status: 'show' }, // Sunday matinee
      { id: generateId(), date: formatDateForInput(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)), time: '19:00', callTime: '18:00', status: 'show' }  // Sunday evening
    ];
    
    return defaultShows;
  }, [formatDateForInput]);

  // Week navigation handlers
  const handleWeekStartDateChange = useCallback((newDate: string) => {
    setWeekStartDate(newDate);
    
    // Auto-calculate week number
    const date = new Date(newDate);
    const weekNumber = getWeekNumberFromDate(date);
    setWeek(weekNumber.toString());

    // Update existing shows dates if we have shows
    if (shows.length > 0) {
      const startDate = new Date(newDate);
      const updatedShows = shows.map((show, index) => {
        // Calculate new date based on show's position in the week
        const originalDate = new Date(show.date);
        const originalWeekStart = new Date(weekStartDate);
        const dayOffset = Math.floor((originalDate.getTime() - originalWeekStart.getTime()) / (24 * 60 * 60 * 1000));
        
        // If we can't calculate offset (first time setting date), use index-based approach
        const finalDayOffset = isNaN(dayOffset) ? (index < 4 ? index + 1 : index - 3) : dayOffset;
        
        const newDate = new Date(startDate.getTime() + finalDayOffset * 24 * 60 * 60 * 1000);
        
        return {
          ...show,
          date: formatDateForInput(newDate)
        };
      });
      setShows(updatedShows);
    }
  }, [shows, weekStartDate, getWeekNumberFromDate, formatDateForInput]);

  const navigateToPreviousWeek = useCallback(() => {
    const currentDate = new Date(weekStartDate);
    const previousWeek = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    handleWeekStartDateChange(formatDateForInput(previousWeek));
  }, [weekStartDate, handleWeekStartDateChange, formatDateForInput]);

  const navigateToNextWeek = useCallback(() => {
    const currentDate = new Date(weekStartDate);
    const nextWeek = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    handleWeekStartDateChange(formatDateForInput(nextWeek));
  }, [weekStartDate, handleWeekStartDateChange, formatDateForInput]);

  const navigateToCurrentWeek = useCallback(() => {
    const nextMonday = getNextMonday();
    handleWeekStartDateChange(formatDateForInput(nextMonday));
  }, [getNextMonday, handleWeekStartDateChange, formatDateForInput]);

  // Action handlers
  const handleSave = useCallback(async () => {
    if (!location.trim() || !week.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in city and week",
        variant: "destructive"
      });
      return;
    }

    if (shows.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please add at least one show",
        variant: "destructive"
      });
      return;
    }

    try {
      if (isEditing && id) {
        await updateMutation.mutateAsync({
          id,
          location,
          week,
          shows,
          assignments
        });
      } else {
        await createMutation.mutateAsync({
          location,
          week,
          shows
        });
      }
    } catch (error) {
      // Error handling is done in mutation onError
    }
  }, [location, week, shows, assignments, isEditing, id, updateMutation, createMutation, toast]);

  const handleAutoGenerate = useCallback(async () => {
    const activeShows = shows.filter(show => show.status === 'show');
    if (activeShows.length === 0) {
      toast({
        title: "No Active Shows",
        description: "Please add shows with 'Show Day' status before generating assignments",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    try {
      await autoGenerateMutation.mutateAsync(shows);
    } catch (error) {
      // Error handling is done in mutation onError
    }
  }, [shows, autoGenerateMutation, toast]);

  const handleClearAll = useCallback(() => {
    if (confirm('Are you sure you want to clear all assignments?')) {
      setAssignments([]);
      toast({
        title: "Cleared",
        description: "All assignments have been cleared"
      });
    }
  }, [toast]);

  const handleAssignmentChange = useCallback((showId: string, role: Role, performer: string) => {
    setAssignments(prev => {
      // Remove existing assignment for this show/role
      const filtered = prev.filter(a => !(a.showId === showId && a.role === role));
      
      // Add new assignment if performer is selected
      if (performer) {
        filtered.push({ showId, role, performer });
      }
      
      return filtered;
    });
  }, []);

  const handleAssignmentUpdate = useCallback((updatedAssignments: Assignment[]) => {
    setAssignments(updatedAssignments);
  }, []);

  const handleShowStatusChange = useCallback((showId: string, status: DayStatus) => {
    setShows(prev => prev.map(show => 
      show.id === showId ? { ...show, status } : show
    ));

    // Clear assignments for this show if it's no longer a show day
    if (status !== 'show') {
      setAssignments(prev => prev.filter(a => a.showId !== showId));
    }
  }, []);

  const handleShowChange = useCallback((showId: string, field: 'date' | 'time' | 'callTime', value: string) => {
    setShows(prev => prev.map(show => 
      show.id === showId ? { ...show, [field]: value } : show
    ));
  }, []);

  const handleAddShow = useCallback(() => {
    const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    const lastShow = shows[shows.length - 1];
    const nextDate = lastShow ? 
      new Date(new Date(lastShow.date).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] :
      new Date().toISOString().split('T')[0];

    const newShow: Show = {
      id: generateId(),
      date: nextDate,
      time: '21:00',
      callTime: '19:00',
      status: 'show'
    };

    setShows(prev => [...prev, newShow]);
  }, [shows]);

  const handleRemoveShow = useCallback((showId: string) => {
    if (confirm('Are you sure you want to remove this show?')) {
      setShows(prev => prev.filter(show => show.id !== showId));
      setAssignments(prev => prev.filter(a => a.showId !== showId));
    }
  }, []);

  // Effects
  useEffect(() => {
    if (scheduleData?.schedule) {
      const schedule = scheduleData.schedule;
      setLocation(schedule.location);
      setWeek(schedule.week);
      setShows(schedule.shows);
      setAssignments(schedule.assignments);

      // Calculate week start date from first show
      if (schedule.shows.length > 0) {
        const firstShowDate = new Date(schedule.shows[0].date);
        // Find the Monday of that week
        const dayOfWeek = firstShowDate.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so 6 days from Monday
        const mondayDate = new Date(firstShowDate.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
        setWeekStartDate(formatDateForInput(mondayDate));
      }
    }
  }, [scheduleData, formatDateForInput]);

  useEffect(() => {
    if (!isEditing && !weekStartDate) {
      const nextMonday = getNextMonday();
      const weekNumber = getWeekNumberFromDate(nextMonday);
      
      setWeek(weekNumber.toString());
      setLocation('London');
      setWeekStartDate(formatDateForInput(nextMonday));
      
      // Generate default shows
      const defaultShows = generateShowsFromWeekStart(formatDateForInput(nextMonday));
      setShows(defaultShows);
    }
  }, [isEditing, weekStartDate, getNextMonday, getWeekNumberFromDate, formatDateForInput, generateShowsFromWeekStart]);

  // Computed properties
  const [initialShows] = useState(() => shows);
  const [initialAssignments] = useState(() => assignments);
  
  const isDirty = useMemo(() => {
    return JSON.stringify(shows) !== JSON.stringify(initialShows) || 
           JSON.stringify(assignments) !== JSON.stringify(initialAssignments) ||
           location !== (scheduleData?.schedule?.location || '') ||
           week !== (scheduleData?.schedule?.week || '');
  }, [shows, assignments, location, week, initialShows, initialAssignments, scheduleData]);

  const stats = useMemo(() => {
    const totalShows = shows.filter(s => s.status === 'show').length;
    const totalAssignments = assignments.length;
    const redDays = shows.filter(s => s.status === 'dayoff').length;
    const totalPossibleAssignments = totalShows * (castData?.roles?.length || 8); // 8 roles per show
    const utilizationRate = totalPossibleAssignments > 0 ? (totalAssignments / totalPossibleAssignments) * 100 : 0;
    
    return {
      totalShows,
      totalAssignments,
      redDays,
      utilizationRate: Math.round(utilizationRate * 100) / 100
    };
  }, [shows, assignments, castData?.roles]);

  const error = useMemo(() => {
    if (scheduleError) return scheduleError as Error;
    if (castError) return castError as Error;
    return null;
  }, [scheduleError, castError]);

  // Memoized values
  const contextValue = useMemo<ScheduleContextValue>(() => ({
    // Data
    location,
    week,
    weekStartDate,
    shows,
    assignments,
    castMembers: castData?.castMembers || [],
    roles: castData?.roles || [],
    
    // State
    isEditing,
    isGenerating,
    isLoading,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDirty,
    scheduleId: id,
    error,
    stats,
    
    // Setters
    setLocation,
    setWeek,
    setWeekStartDate,
    setShows,
    setAssignments,
    setIsGenerating,
    
    // Actions
    handleSave,
    handleAutoGenerate,
    handleClearAll,
    handleAssignmentChange,
    handleAssignmentUpdate,
    handleShowStatusChange,
    handleShowChange,
    handleAddShow,
    handleRemoveShow,
    handleWeekStartDateChange,
    navigateToPreviousWeek,
    navigateToNextWeek,
    navigateToCurrentWeek,
  }), [
    location, week, weekStartDate, shows, assignments, castData?.castMembers, castData?.roles,
    isEditing, isGenerating, isLoading, createMutation.isPending, updateMutation.isPending, isDirty, id, error, stats,
    setLocation, setWeek, setWeekStartDate, setShows, setAssignments, setIsGenerating,
    handleSave, handleAutoGenerate, handleClearAll, handleAssignmentChange, handleAssignmentUpdate,
    handleShowStatusChange, handleShowChange, handleAddShow, handleRemoveShow,
    handleWeekStartDateChange, navigateToPreviousWeek, navigateToNextWeek, navigateToCurrentWeek
  ]);

  return contextValue;
};