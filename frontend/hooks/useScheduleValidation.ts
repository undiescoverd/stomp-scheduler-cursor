import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { backend } from '../client';
// import { PerformanceMonitor } from '../utils/performance';
import type { 
  Schedule, 
  Show, 
  Assignment, 
  Role, 
  CastMember,
  ValidationIssue,
  ValidateComprehensiveResponse 
} from '~backend/scheduler/types';

// Real-time validation state
export interface ValidationState {
  isValidating: boolean;
  isValid: boolean;
  overallScore: number;
  lastValidated?: Date;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  criticalErrors: ValidationIssue[];
  suggestions: string[];
}

// Field-specific validation
export interface FieldValidation {
  [fieldName: string]: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  };
}

// Constraint validation types
export interface ConstraintValidation {
  roleEligibility: ConstraintResult;
  consecutiveShows: ConstraintResult;
  loadBalancing: ConstraintResult;
  specialDays: ConstraintResult;
  completeness: ConstraintResult;
  conflicts: ConstraintResult;
}

export interface ConstraintResult {
  isValid: boolean;
  score: number;
  issues: ValidationIssue[];
  details: any;
}

// Live validation options
export interface UseScheduleValidationOptions {
  enableRealTimeValidation?: boolean;
  validationDebounceMs?: number;
  enableConstraintChecking?: boolean;
  enableSuggestions?: boolean;
  validationLevel?: 'basic' | 'comprehensive';
  onValidationChange?: (state: ValidationState) => void;
  customValidators?: CustomValidator[];
}

export interface CustomValidator {
  name: string;
  validate: (shows: Show[], assignments: Assignment[], castMembers: CastMember[]) => ValidationIssue[];
}

// Warning and suggestion system
export interface ValidationAlert {
  type: 'error' | 'warning' | 'suggestion';
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  message: string;
  field?: string;
  suggestion?: string;
  autofix?: () => void;
}

/**
 * Real-time validation hook for schedule operations
 * Provides comprehensive constraint checking, error management, and suggestion system
 */
export function useScheduleValidation(
  shows: Show[] = [],
  assignments: Assignment[] = [],
  options: UseScheduleValidationOptions = {}
) {
  const {
    enableRealTimeValidation = true,
    validationDebounceMs = 500,
    enableConstraintChecking = true,
    enableSuggestions = true,
    validationLevel = 'comprehensive',
    onValidationChange,
    customValidators = []
  } = options;

  // Validation state
  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    isValid: true,
    overallScore: 100,
    issues: [],
    warnings: [],
    errors: [],
    criticalErrors: [],
    suggestions: []
  });

  const [fieldValidation, setFieldValidation] = useState<FieldValidation>({});
  const [validationAlerts, setValidationAlerts] = useState<ValidationAlert[]>([]);
  const validationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Fetch cast members for validation
  const { data: castData } = useQuery({
    queryKey: ['cast-members'],
    queryFn: () => backend.scheduler.getCastMembers(),
    staleTime: 1000 * 60 * 10 // 10 minutes
  });

  // Comprehensive validation mutation
  const validateMutation = useMutation({
    mutationFn: async (data: { shows: Show[]; assignments: Assignment[] }) => {
      // PerformanceMonitor.startMeasurement('schedule-validation', {
      //   showCount: data.shows.length,
      //   assignmentCount: data.assignments.length,
      //   validationLevel
      // });

      try {
        const response = validationLevel === 'comprehensive'
          ? await backend.scheduler.validateComprehensive(data)
          : await backend.scheduler.validate(data);
        
        // PerformanceMonitor.endMeasurement('schedule-validation');
        return response;
      } catch (error) {
        // PerformanceMonitor.endMeasurement('schedule-validation');
        throw error;
      }
    },
    onSuccess: (data) => {
      if ('overallScore' in data) {
        const comprehensiveData = data as any; // Type compatibility handled below
        updateValidationState(comprehensiveData);
      } else {
        updateBasicValidationState(data);
      }
    }
  });

  // Update validation state from comprehensive response
  const updateValidationState = useCallback((data: ValidateComprehensiveResponse) => {
    const errors = data.issues.filter(issue => issue.type === 'error');
    const warnings = data.issues.filter(issue => issue.type === 'warning');
    const criticalErrors = errors.filter(issue => issue.severity === 'critical');

    const newState: ValidationState = {
      isValidating: false,
      isValid: data.isValid,
      overallScore: data.overallScore,
      lastValidated: new Date(),
      issues: data.issues,
      warnings,
      errors,
      criticalErrors,
      suggestions: data.recommendations || []
    };

    setValidationState(newState);
    onValidationChange?.(newState);

    // Generate validation alerts
    generateValidationAlerts(data);
  }, [onValidationChange]);

  // Update validation state from basic response
  const updateBasicValidationState = useCallback((data: any) => {
    const issues: ValidationIssue[] = [
      ...data.errors.map((error: string) => ({
        type: 'error' as const,
        category: 'general' as const,
        message: error,
        severity: 'high' as const
      })),
      ...data.warnings.map((warning: string) => ({
        type: 'warning' as const,
        category: 'general' as const,
        message: warning,
        severity: 'medium' as const
      }))
    ];

    const newState: ValidationState = {
      isValidating: false,
      isValid: data.isValid,
      overallScore: data.isValid ? 100 : 50,
      lastValidated: new Date(),
      issues,
      warnings: issues.filter(i => i.type === 'warning'),
      errors: issues.filter(i => i.type === 'error'),
      criticalErrors: issues.filter(i => i.type === 'error' && i.severity === 'critical'),
      suggestions: []
    };

    setValidationState(newState);
    onValidationChange?.(newState);
  }, [onValidationChange]);

  // Generate validation alerts with suggestions
  const generateValidationAlerts = useCallback((data: ValidateComprehensiveResponse) => {
    const alerts: ValidationAlert[] = [];

    // Process validation issues
    data.issues.forEach(issue => {
      // Map backend severity to frontend ValidationAlert types
      const mapSeverity = (severity: string): 'critical' | 'high' | 'medium' | 'low' => {
        switch (severity) {
          case 'error': return 'critical';
          case 'warning': return 'medium';
          case 'info': 
          case 'suggestion':
          default: return 'low';
        }
      };
      
      const mapType = (severity: string): 'error' | 'warning' | 'suggestion' => {
        switch (severity) {
          case 'error': return 'error';
          case 'warning': return 'warning';
          case 'info':
          case 'suggestion':
          default: return 'suggestion';
        }
      };
      
      alerts.push({
        type: mapType(issue.severity),
        severity: mapSeverity(issue.severity),
        category: issue.category,
        message: issue.message,
        field: issue.performer || issue.role || issue.showId,
        suggestion: issue.suggestion
      });
    });

    // Add suggestions from recommendations
    data.recommendations.forEach(recommendation => {
      alerts.push({
        type: 'suggestion',
        severity: 'low',
        category: 'optimization',
        message: recommendation
      });
    });

    setValidationAlerts(alerts);
  }, []);

  // Real-time field validation
  const validateField = useCallback(async (fieldName: string, value: any) => {
    const fieldValidationRules: Record<string, (value: any) => FieldValidation[string]> = {
      location: (value: string) => ({
        isValid: value.trim().length > 0,
        errors: value.trim().length === 0 ? ['Location is required'] : [],
        warnings: value.length < 3 ? ['Location name is very short'] : [],
        suggestions: value.length < 3 ? ['Consider using a more descriptive location name'] : []
      }),
      
      week: (value: string) => ({
        isValid: /^\d{4}-W\d{2}$/.test(value) || value.trim().length > 0,
        errors: value.trim().length === 0 ? ['Week is required'] : [],
        warnings: !/^\d{4}-W\d{2}$/.test(value) && value.trim().length > 0 ? ['Consider using YYYY-WXX format'] : [],
        suggestions: []
      }),
      
      performer: (value: string) => {
        const castMembers = castData?.castMembers || [];
        const isValidPerformer = castMembers.some(cm => cm.name === value);
        
        return {
          isValid: isValidPerformer || value === '',
          errors: value && !isValidPerformer ? [`"${value}" is not a valid cast member`] : [],
          warnings: [],
          suggestions: value && !isValidPerformer ? ['Select from available cast members'] : []
        };
      },
      
      role: (value: Role | 'OFF') => {
        const validRoles = ['Sarge', 'Potato', 'Mozzie', 'Ringo', 'Particle', 'Bin', 'Cornish', 'Who', 'OFF'];
        
        return {
          isValid: validRoles.includes(value),
          errors: !validRoles.includes(value) ? [`"${value}" is not a valid role`] : [],
          warnings: [],
          suggestions: []
        };
      }
    };

    const validator = fieldValidationRules[fieldName];
    if (validator) {
      const result = validator(value);
      setFieldValidation(prev => ({
        ...prev,
        [fieldName]: result
      }));
      return result;
    }

    return { isValid: true, errors: [], warnings: [], suggestions: [] };
  }, [castData?.castMembers]);

  // Custom constraint validation
  const validateConstraints = useMemo((): ConstraintValidation => {
    if (!enableConstraintChecking) {
      return {
        roleEligibility: { isValid: true, score: 100, issues: [], details: {} },
        consecutiveShows: { isValid: true, score: 100, issues: [], details: {} },
        loadBalancing: { isValid: true, score: 100, issues: [], details: {} },
        specialDays: { isValid: true, score: 100, issues: [], details: {} },
        completeness: { isValid: true, score: 100, issues: [], details: {} },
        conflicts: { isValid: true, score: 100, issues: [], details: {} }
      };
    }

    const castMembers = castData?.castMembers || [];
    
    // Role eligibility validation
    const roleEligibilityIssues: ValidationIssue[] = [];
    assignments.forEach(assignment => {
      if (assignment.role === 'OFF') return;
      
      const castMember = castMembers.find(cm => cm.name === assignment.performer);
      if (!castMember) {
        roleEligibilityIssues.push({
          type: 'error',
          category: 'role_eligibility',
          message: `Performer "${assignment.performer}" not found in cast`,
          performer: assignment.performer,
          showId: assignment.showId,
          role: assignment.role,
          severity: 'critical'
        });
      } else if (!castMember.eligibleRoles.includes(assignment.role as Role)) {
        roleEligibilityIssues.push({
          type: 'error',
          category: 'role_eligibility',
          message: `"${assignment.performer}" is not eligible for role "${assignment.role}"`,
          performer: assignment.performer,
          showId: assignment.showId,
          role: assignment.role,
          severity: 'high',
          suggestion: `Assign "${assignment.role}" to: ${castMembers.filter(cm => cm.eligibleRoles.includes(assignment.role as Role)).map(cm => cm.name).join(', ')}`
        });
      }
    });

    // Consecutive shows validation
    const consecutiveIssues: ValidationIssue[] = [];
    const performerDates = new Map<string, string[]>();
    
    assignments.forEach(assignment => {
      const show = shows.find(s => s.id === assignment.showId);
      if (show && assignment.role !== 'OFF') {
        if (!performerDates.has(assignment.performer)) {
          performerDates.set(assignment.performer, []);
        }
        if (!performerDates.get(assignment.performer)!.includes(show.date)) {
          performerDates.get(assignment.performer)!.push(show.date);
        }
      }
    });

    performerDates.forEach((dates, performer) => {
      const sortedDates = dates.sort();
      let consecutiveCount = 1;
      
      for (let i = 1; i < sortedDates.length; i++) {
        const currentDate = new Date(sortedDates[i]);
        const previousDate = new Date(sortedDates[i - 1]);
        const dayDiff = (currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (dayDiff === 1) {
          consecutiveCount++;
          if (consecutiveCount > 3) {
            consecutiveIssues.push({
              type: 'warning',
              category: 'consecutive_shows',
              message: `"${performer}" has ${consecutiveCount} consecutive performance days`,
              performer,
              severity: consecutiveCount > 5 ? 'high' : 'medium',
              suggestion: 'Consider giving this performer a day off or red day'
            });
          }
        } else {
          consecutiveCount = 1;
        }
      }
    });

    // Load balancing validation
    const loadBalancingIssues: ValidationIssue[] = [];
    const performerWorkload = new Map<string, number>();
    
    assignments.forEach(assignment => {
      if (assignment.role !== 'OFF') {
        performerWorkload.set(
          assignment.performer,
          (performerWorkload.get(assignment.performer) || 0) + 1
        );
      }
    });

    const workloads = Array.from(performerWorkload.values());
    if (workloads.length > 0) {
      const avgWorkload = workloads.reduce((sum, w) => sum + w, 0) / workloads.length;
      const maxWorkload = Math.max(...workloads);
      const minWorkload = Math.min(...workloads);
      
      if (maxWorkload - minWorkload > 3) {
        performerWorkload.forEach((workload, performer) => {
          if (workload > avgWorkload + 2) {
            loadBalancingIssues.push({
              type: 'warning',
              category: 'load_balancing',
              message: `"${performer}" is overworked with ${workload} assignments (avg: ${avgWorkload.toFixed(1)})`,
              performer,
              severity: 'medium',
              suggestion: 'Consider redistributing some assignments to less busy performers'
            });
          } else if (workload < avgWorkload - 2) {
            loadBalancingIssues.push({
              type: 'info',
              category: 'load_balancing',
              message: `"${performer}" is underutilized with ${workload} assignments (avg: ${avgWorkload.toFixed(1)})`,
              performer,
              severity: 'low',
              suggestion: 'Consider assigning more roles to this performer'
            });
          }
        });
      }
    }

    // Completeness validation
    const completenessIssues: ValidationIssue[] = [];
    const activeShows = shows.filter(s => s.status === 'show');
    const requiredRoles: Role[] = ['Sarge', 'Potato', 'Mozzie', 'Ringo', 'Particle', 'Bin', 'Cornish', 'Who'];
    
    activeShows.forEach(show => {
      requiredRoles.forEach(role => {
        const assignment = assignments.find(a => a.showId === show.id && a.role === role);
        if (!assignment) {
          completenessIssues.push({
            type: 'error',
            category: 'completeness',
            message: `Role "${role}" is not assigned for show on ${show.date} at ${show.time}`,
            showId: show.id,
            role,
            severity: 'high',
            suggestion: `Assign "${role}" to an eligible performer`
          });
        }
      });
    });

    // Conflicts validation
    const conflictIssues: ValidationIssue[] = [];
    const performerShowMap = new Map<string, Map<string, Assignment[]>>();
    
    assignments.forEach(assignment => {
      const show = shows.find(s => s.id === assignment.showId);
      if (!show || assignment.role === 'OFF') return;
      
      if (!performerShowMap.has(assignment.performer)) {
        performerShowMap.set(assignment.performer, new Map());
      }
      
      const performerShows = performerShowMap.get(assignment.performer)!;
      const showKey = `${show.date}-${show.time}`;
      
      if (!performerShows.has(showKey)) {
        performerShows.set(showKey, []);
      }
      
      performerShows.get(showKey)!.push(assignment);
    });

    performerShowMap.forEach((showMap, performer) => {
      showMap.forEach((assignments, showKey) => {
        if (assignments.length > 1) {
          conflictIssues.push({
            type: 'error',
            category: 'conflicts',
            message: `"${performer}" has multiple role assignments for the same show`,
            performer,
            severity: 'critical',
            suggestion: 'Remove duplicate assignments for this performer'
          });
        }
      });
    });

    return {
      roleEligibility: {
        isValid: roleEligibilityIssues.length === 0,
        score: Math.max(0, 100 - roleEligibilityIssues.length * 10),
        issues: roleEligibilityIssues,
        details: { violations: roleEligibilityIssues.length }
      },
      consecutiveShows: {
        isValid: consecutiveIssues.filter(i => i.type === 'error').length === 0,
        score: Math.max(0, 100 - consecutiveIssues.length * 5),
        issues: consecutiveIssues,
        details: { warnings: consecutiveIssues.length }
      },
      loadBalancing: {
        isValid: loadBalancingIssues.filter(i => i.type === 'error').length === 0,
        score: Math.max(0, 100 - loadBalancingIssues.length * 3),
        issues: loadBalancingIssues,
        details: { imbalances: loadBalancingIssues.length }
      },
      specialDays: {
        isValid: true,
        score: 100,
        issues: [],
        details: {}
      },
      completeness: {
        isValid: completenessIssues.length === 0,
        score: Math.max(0, 100 - completenessIssues.length * 5),
        issues: completenessIssues,
        details: { missingRoles: completenessIssues.length }
      },
      conflicts: {
        isValid: conflictIssues.length === 0,
        score: conflictIssues.length === 0 ? 100 : 0,
        issues: conflictIssues,
        details: { conflicts: conflictIssues.length }
      }
    };
  }, [shows, assignments, castData?.castMembers, enableConstraintChecking]);

  // Trigger validation with debouncing
  const triggerValidation = useCallback(() => {
    if (!enableRealTimeValidation || shows.length === 0) return;

    setValidationState(prev => ({ ...prev, isValidating: true }));

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      validateMutation.mutate({ shows, assignments });
    }, validationDebounceMs);
  }, [enableRealTimeValidation, shows, assignments, validationDebounceMs, validateMutation]);

  // Run custom validators
  const runCustomValidators = useCallback(() => {
    if (!enableSuggestions || customValidators.length === 0) return [];

    const customIssues: ValidationIssue[] = [];
    const castMembers = castData?.castMembers || [];

    customValidators.forEach(validator => {
      try {
        const issues = validator.validate(shows, assignments, castMembers);
        customIssues.push(...issues);
      } catch (error) {
        console.warn(`Custom validator "${validator.name}" failed:`, error);
      }
    });

    return customIssues;
  }, [customValidators, shows, assignments, castData?.castMembers, enableSuggestions]);

  // Trigger validation when data changes
  useEffect(() => {
    triggerValidation();
  }, [triggerValidation]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Manual validation trigger
  const validateNow = useCallback(async () => {
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    setValidationState(prev => ({ ...prev, isValidating: true }));
    await validateMutation.mutateAsync({ shows, assignments });
  }, [shows, assignments, validateMutation]);

  // Get validation status for specific field
  const getFieldValidation = useCallback((fieldName: string) => {
    return fieldValidation[fieldName] || { isValid: true, errors: [], warnings: [], suggestions: [] };
  }, [fieldValidation]);

  // Get issues by category
  const getIssuesByCategory = useCallback((category: string) => {
    return validationState.issues.filter(issue => issue.category === category);
  }, [validationState.issues]);

  // Get suggestions for specific performer
  const getSuggestionsForPerformer = useCallback((performer: string) => {
    return validationState.issues
      .filter(issue => issue.performer === performer && issue.suggestion)
      .map(issue => issue.suggestion!)
      .filter(Boolean);
  }, [validationState.issues]);

  return {
    // Validation state
    validationState,
    fieldValidation,
    constraintValidation: validateConstraints,
    validationAlerts,
    customIssues: runCustomValidators(),
    
    // Actions
    validateNow,
    validateField,
    getFieldValidation,
    getIssuesByCategory,
    getSuggestionsForPerformer,
    
    // Status
    isValidating: validateMutation.isPending || validationState.isValidating,
    validationError: validateMutation.error,
    
    // Metrics
    validationMetrics: {
      totalIssues: validationState.issues.length,
      errorCount: validationState.errors.length,
      warningCount: validationState.warnings.length,
      criticalErrorCount: validationState.criticalErrors.length,
      overallScore: validationState.overallScore,
      lastValidated: validationState.lastValidated
    }
  };
}
