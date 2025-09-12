import { api } from "encore.dev/api";
import { Show, Assignment } from "./types";
import { SchedulingAlgorithm, ConstraintResult } from "./algorithm";

export interface ValidateComprehensiveRequest {
  shows: Show[];
  assignments: Assignment[];
}

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  category: "role_eligibility" | "consecutive_shows" | "load_balancing" | "special_days" | "completeness" | "conflicts";
  message: string;
  performer?: string;
  showId?: string;
  role?: string;
  severity: "critical" | "high" | "medium" | "low";
  suggestion?: string;
}

export interface LoadBalancingStats {
  performer: string;
  showCount: number;
  expectedRange: { min: number; max: number };
  status: "underutilized" | "optimal" | "overworked" | "critical";
  variance: number;
}

export interface ConsecutiveShowAnalysis {
  performer: string;
  maxConsecutive: number;
  sequences: Array<{
    startDate: string;
    endDate: string;
    count: number;
    severity: "ok" | "warning" | "critical";
  }>;
}

export interface ValidateComprehensiveResponse {
  isValid: boolean;
  overallScore: number; // 0-100, where 100 is perfect
  summary: {
    totalIssues: number;
    criticalErrors: number;
    warnings: number;
    completionPercentage: number;
  };
  issues: ValidationIssue[];
  loadBalancing: LoadBalancingStats[];
  consecutiveAnalysis: ConsecutiveShowAnalysis[];
  roleCompleteness: Array<{
    role: string;
    filledShows: number;
    totalShows: number;
    completionPercentage: number;
    missingShows: string[];
  }>;
  specialDayHandling: {
    travelDays: number;
    dayOffs: number;
    totalSpecialDays: number;
    impactOnScheduling: string;
  };
  recommendations: string[];
}

// Provides comprehensive validation of schedule with detailed business logic analysis.
export const validateComprehensive = api<ValidateComprehensiveRequest, ValidateComprehensiveResponse>(
  { expose: true, method: "POST", path: "/schedules/validate-comprehensive" },
  async (req) => {
    // Get current cast members from company system
    const { getCastMembers } = await import("./cast_members");
    const castData = await getCastMembers();
    
    const algorithm = new SchedulingAlgorithm(req.shows, castData.castMembers);
    const basicValidation = algorithm.validateSchedule(req.assignments);
    
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];
    
    // Filter active shows for analysis
    const activeShows = req.shows.filter(show => show.status === "show");
    const specialDays = req.shows.filter(show => show.status !== "show");
    
    // 1. Role Eligibility Validation
    const roleEligibilityIssues = validateRoleEligibility(req.assignments, castData.castMembers);
    issues.push(...roleEligibilityIssues);
    
    // 2. Consecutive Shows Analysis
    const consecutiveAnalysis = analyzeConsecutiveShows(req.assignments, activeShows, castData.castMembers);
    consecutiveAnalysis.forEach(analysis => {
      analysis.sequences.forEach(sequence => {
        if (sequence.severity === "critical") {
          issues.push({
            type: "error",
            category: "consecutive_shows",
            message: `${analysis.performer} has ${sequence.count} consecutive shows from ${sequence.startDate} to ${sequence.endDate} (critical burnout risk)`,
            performer: analysis.performer,
            severity: "critical",
            suggestion: `Consider redistributing shows to give ${analysis.performer} breaks`
          });
        } else if (sequence.severity === "warning") {
          issues.push({
            type: "warning",
            category: "consecutive_shows",
            message: `${analysis.performer} has ${sequence.count} consecutive shows from ${sequence.startDate} to ${sequence.endDate}`,
            performer: analysis.performer,
            severity: "medium",
            suggestion: `Monitor ${analysis.performer} for fatigue and consider breaks`
          });
        }
      });
    });
    
    // 3. Load Balancing Analysis
    const loadBalancing = analyzeLoadBalancing(req.assignments, activeShows, castData.castMembers);
    loadBalancing.forEach(stats => {
      if (stats.status === "critical") {
        issues.push({
          type: "error",
          category: "load_balancing",
          message: `${stats.performer} has ${stats.showCount} shows (extremely overworked)`,
          performer: stats.performer,
          severity: "critical",
          suggestion: `Redistribute shows from ${stats.performer} to other cast members`
        });
      } else if (stats.status === "overworked") {
        issues.push({
          type: "warning",
          category: "load_balancing",
          message: `${stats.performer} has ${stats.showCount} shows (above optimal range)`,
          performer: stats.performer,
          severity: "high",
          suggestion: `Consider reducing ${stats.performer}'s workload`
        });
      } else if (stats.status === "underutilized") {
        issues.push({
          type: "warning",
          category: "load_balancing",
          message: `${stats.performer} has only ${stats.showCount} shows (underutilized)`,
          performer: stats.performer,
          severity: "low",
          suggestion: `Consider assigning more shows to ${stats.performer}`
        });
      }
    });
    
    // 4. Role Completeness Analysis
    const roleCompleteness = analyzeRoleCompleteness(req.assignments, activeShows);
    roleCompleteness.forEach(roleStats => {
      if (roleStats.completionPercentage < 100) {
        const severity = roleStats.completionPercentage < 50 ? "critical" : 
                        roleStats.completionPercentage < 80 ? "high" : "medium";
        issues.push({
          type: roleStats.completionPercentage < 100 ? "error" : "warning",
          category: "completeness",
          message: `Role ${roleStats.role} is only ${roleStats.completionPercentage}% complete (${roleStats.filledShows}/${roleStats.totalShows} shows)`,
          role: roleStats.role,
          severity: severity as "critical" | "high" | "medium",
          suggestion: `Assign ${roleStats.role} for remaining shows: ${roleStats.missingShows.join(", ")}`
        });
      }
    });
    
    // 5. Conflict Detection
    const conflictIssues = detectConflicts(req.assignments, activeShows);
    issues.push(...conflictIssues);
    
    // 6. Special Day Handling
    const specialDayHandling = analyzeSpecialDayHandling(specialDays, req.assignments);
    if (specialDayHandling.impactOnScheduling === "high") {
      issues.push({
        type: "info",
        category: "special_days",
        message: `${specialDayHandling.totalSpecialDays} special days may impact cast availability`,
        severity: "low",
        suggestion: "Ensure adequate cast coverage around travel and day-off periods"
      });
    }
    
    // 7. Generate Recommendations
    if (loadBalancing.some(lb => lb.status === "overworked")) {
      recommendations.push("Consider redistributing workload among cast members to prevent burnout");
    }
    
    if (consecutiveAnalysis.some(ca => ca.maxConsecutive >= 5)) {
      recommendations.push("Implement mandatory breaks between consecutive show sequences");
    }
    
    if (roleCompleteness.some(rc => rc.completionPercentage < 90)) {
      recommendations.push("Complete role assignments for all shows to ensure full coverage");
    }
    
    const completionPercentage = calculateCompletionPercentage(req.assignments, activeShows);
    if (completionPercentage < 100) {
      recommendations.push(`Schedule is ${completionPercentage}% complete - assign remaining roles`);
    }
    
    // 8. Calculate Overall Score
    const overallScore = calculateOverallScore(issues, completionPercentage, activeShows.length);
    
    // 9. Categorize Issues by Severity
    const criticalErrors = issues.filter(i => i.type === "error" && i.severity === "critical").length;
    const warnings = issues.filter(i => i.type === "warning").length;
    
    return {
      isValid: criticalErrors === 0 && completionPercentage === 100,
      overallScore,
      summary: {
        totalIssues: issues.length,
        criticalErrors,
        warnings,
        completionPercentage
      },
      issues,
      loadBalancing,
      consecutiveAnalysis,
      roleCompleteness,
      specialDayHandling,
      recommendations
    };
  }
);

function validateRoleEligibility(assignments: Assignment[], castMembers: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  assignments.forEach(assignment => {
    const castMember = castMembers.find(m => m.name === assignment.performer);
    if (!castMember) {
      issues.push({
        type: "error",
        category: "role_eligibility",
        message: `Unknown performer: ${assignment.performer}`,
        performer: assignment.performer,
        severity: "critical",
        suggestion: "Verify performer name or add to cast list"
      });
    } else if (!castMember.eligibleRoles.includes(assignment.role)) {
      issues.push({
        type: "error",
        category: "role_eligibility",
        message: `${assignment.performer} is not eligible for role ${assignment.role}`,
        performer: assignment.performer,
        role: assignment.role,
        severity: "critical",
        suggestion: `Assign ${assignment.role} to an eligible performer: ${castMembers.filter(m => m.eligibleRoles.includes(assignment.role)).map(m => m.name).join(", ")}`
      });
    }
  });
  
  return issues;
}

function analyzeConsecutiveShows(assignments: Assignment[], activeShows: Show[], castMembers: any[]): ConsecutiveShowAnalysis[] {
  const analysis: ConsecutiveShowAnalysis[] = [];
  
  castMembers.forEach(member => {
    const memberShows = new Set<string>();
    assignments.forEach(assignment => {
      if (assignment.performer === member.name) {
        memberShows.add(assignment.showId);
      }
    });
    
    if (memberShows.size === 0) {
      analysis.push({
        performer: member.name,
        maxConsecutive: 0,
        sequences: []
      });
      return;
    }
    
    // Sort shows by date and time
    const sortedShows = [...activeShows]
      .filter(show => memberShows.has(show.id))
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });
    
    const sequences: Array<{
      startDate: string;
      endDate: string;
      count: number;
      severity: "ok" | "warning" | "critical";
    }> = [];
    
    let currentSequence: { startDate: string; endDate: string; count: number } | null = null;
    let maxConsecutive = 0;
    let lastShowDate: Date | null = null;
    
    sortedShows.forEach(show => {
      const showDate = new Date(`${show.date}T${show.time}`);
      
      if (lastShowDate) {
        const daysDiff = Math.floor((showDate.getTime() - lastShowDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 2) { // Consider consecutive if within 2 days
          if (currentSequence) {
            currentSequence.count++;
            currentSequence.endDate = show.date;
          } else {
            // Start new sequence
            const prevShow = sortedShows[sortedShows.indexOf(show) - 1];
            currentSequence = {
              startDate: prevShow?.date || show.date,
              endDate: show.date,
              count: 2
            };
          }
        } else {
          // End current sequence
          if (currentSequence && currentSequence.count >= 3) {
            const severity = currentSequence.count >= 6 ? "critical" : 
                           currentSequence.count >= 4 ? "warning" : "ok";
            sequences.push({ ...currentSequence, severity });
            maxConsecutive = Math.max(maxConsecutive, currentSequence.count);
          }
          currentSequence = null;
        }
      }
      
      lastShowDate = showDate;
    });
    
    // Handle final sequence
    if (currentSequence && currentSequence.count >= 3) {
      const severity = currentSequence.count >= 6 ? "critical" : 
                     currentSequence.count >= 4 ? "warning" : "ok";
      sequences.push({ ...currentSequence, severity });
      maxConsecutive = Math.max(maxConsecutive, currentSequence.count);
    }
    
    analysis.push({
      performer: member.name,
      maxConsecutive,
      sequences
    });
  });
  
  return analysis;
}

function analyzeLoadBalancing(assignments: Assignment[], activeShows: Show[], castMembers: any[]): LoadBalancingStats[] {
  const stats: LoadBalancingStats[] = [];
  
  // Calculate show counts per performer
  const showCounts: Record<string, number> = {};
  castMembers.forEach(member => {
    showCounts[member.name] = 0;
  });
  
  const showPerformers = new Map<string, Set<string>>();
  assignments.forEach(assignment => {
    if (activeShows.some(show => show.id === assignment.showId)) {
      if (!showPerformers.has(assignment.showId)) {
        showPerformers.set(assignment.showId, new Set());
      }
      showPerformers.get(assignment.showId)!.add(assignment.performer);
    }
  });
  
  for (const [, performers] of showPerformers) {
    for (const performer of performers) {
      if (showCounts.hasOwnProperty(performer)) {
        showCounts[performer]++;
      }
    }
  }
  
  // Calculate expected range
  const totalShows = activeShows.length;
  const totalPerformers = castMembers.length;
  const averageShows = totalShows > 0 ? totalShows / totalPerformers : 0;
  const expectedMin = Math.max(0, Math.floor(averageShows * 0.7));
  const expectedMax = Math.ceil(averageShows * 1.3);
  
  castMembers.forEach(member => {
    const count = showCounts[member.name] || 0;
    const variance = Math.abs(count - averageShows);
    
    let status: "underutilized" | "optimal" | "overworked" | "critical";
    if (count === 0 || count < expectedMin) {
      status = "underutilized";
    } else if (count > expectedMax * 1.5) {
      status = "critical";
    } else if (count > expectedMax) {
      status = "overworked";
    } else {
      status = "optimal";
    }
    
    stats.push({
      performer: member.name,
      showCount: count,
      expectedRange: { min: expectedMin, max: expectedMax },
      status,
      variance
    });
  });
  
  return stats;
}

function analyzeRoleCompleteness(assignments: Assignment[], activeShows: Show[]) {
  const roles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
  
  return roles.map(role => {
    const roleAssignments = assignments.filter(a => 
      a.role === role && activeShows.some(show => show.id === a.showId)
    );
    
    const filledShows = roleAssignments.length;
    const totalShows = activeShows.length;
    const completionPercentage = totalShows > 0 ? Math.round((filledShows / totalShows) * 100) : 100;
    
    const assignedShowIds = new Set(roleAssignments.map(a => a.showId));
    const missingShows = activeShows
      .filter(show => !assignedShowIds.has(show.id))
      .map(show => `${show.date} ${show.time}`);
    
    return {
      role,
      filledShows,
      totalShows,
      completionPercentage,
      missingShows
    };
  });
}

function detectConflicts(assignments: Assignment[], activeShows: Show[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Group assignments by show
  const showAssignments = new Map<string, Assignment[]>();
  assignments.forEach(assignment => {
    if (activeShows.some(show => show.id === assignment.showId)) {
      if (!showAssignments.has(assignment.showId)) {
        showAssignments.set(assignment.showId, []);
      }
      showAssignments.get(assignment.showId)!.push(assignment);
    }
  });
  
  // Check for duplicate performers in same show
  for (const [showId, showAssigns] of showAssignments) {
    const performerCounts = new Map<string, string[]>();
    
    showAssigns.forEach(assignment => {
      if (!performerCounts.has(assignment.performer)) {
        performerCounts.set(assignment.performer, []);
      }
      performerCounts.get(assignment.performer)!.push(assignment.role);
    });
    
    for (const [performer, roles] of performerCounts) {
      if (roles.length > 1) {
        const show = activeShows.find(s => s.id === showId);
        issues.push({
          type: "error",
          category: "conflicts",
          message: `${performer} is assigned multiple roles (${roles.join(", ")}) in show on ${show?.date} ${show?.time}`,
          performer,
          showId,
          severity: "critical",
          suggestion: `Assign only one role per performer per show`
        });
      }
    }
  }
  
  return issues;
}

function analyzeSpecialDayHandling(specialDays: Show[], assignments: Assignment[]) {
  const travelDays = specialDays.filter(day => day.status === "travel").length;
  const dayOffs = specialDays.filter(day => day.status === "dayoff").length;
  const totalSpecialDays = specialDays.length;
  
  // Check for assignments on special days (which shouldn't happen)
  const specialDayAssignments = assignments.filter(assignment =>
    specialDays.some(day => day.id === assignment.showId)
  );
  
  let impactOnScheduling = "low";
  if (totalSpecialDays > 3) {
    impactOnScheduling = "high";
  } else if (totalSpecialDays > 1) {
    impactOnScheduling = "medium";
  }
  
  return {
    travelDays,
    dayOffs,
    totalSpecialDays,
    impactOnScheduling,
    invalidAssignments: specialDayAssignments.length
  };
}

function calculateCompletionPercentage(assignments: Assignment[], activeShows: Show[]): number {
  const totalSlots = activeShows.length * 8; // 8 roles per show
  const filledSlots = assignments.filter(assignment =>
    activeShows.some(show => show.id === assignment.showId)
  ).length;
  
  return totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100;
}

function calculateOverallScore(issues: ValidationIssue[], completionPercentage: number, totalShows: number): number {
  let score = 100;
  
  // Deduct points for issues
  issues.forEach(issue => {
    switch (issue.severity) {
      case "critical":
        score -= 20;
        break;
      case "high":
        score -= 10;
        break;
      case "medium":
        score -= 5;
        break;
      case "low":
        score -= 2;
        break;
    }
  });
  
  // Factor in completion percentage
  score = score * (completionPercentage / 100);
  
  // Bonus for complete schedules
  if (completionPercentage === 100 && issues.filter(i => i.type === "error").length === 0) {
    score = Math.min(100, score + 10);
  }
  
  return Math.max(0, Math.round(score));
}
