// Core domain types
export type Role = "Sarge" | "Potato" | "Mozzie" | "Ringo" | "Particle" | "Bin" | "Cornish" | "Who";

export type DayStatus = "show" | "travel" | "dayoff";

export interface CastMember {
  name: string;
  eligibleRoles: Role[];
}

export interface Show {
  id: string;
  date: string;
  time: string;
  callTime: string;
  status: DayStatus;
}

export interface Assignment {
  showId: string;
  role: Role | "OFF";
  performer: string;
  isRedDay?: boolean;
}

export interface Schedule {
  id: string;
  location: string;
  week: string;
  shows: Show[];
  assignments: Assignment[];
  createdAt: Date;
  updatedAt: Date;
}

// Validation types
export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  showId?: string;
  performer?: string;
  role?: Role;
  suggestedFix?: string;
}

export interface LoadBalancingStats {
  performerWorkload: Record<string, number>;
  roleDistribution: Record<Role, number>;
  consecutiveShowsWarnings: Array<{
    performer: string;
    consecutiveShows: number;
    dates: string[];
  }>;
}

export interface ConsecutiveShowAnalysis {
  performer: string;
  consecutiveShows: Array<{
    startDate: string;
    endDate: string;
    showCount: number;
    roles: Role[];
  }>;
  totalConsecutiveDays: number;
  redDaysUsed: number;
}

export interface ValidateComprehensiveResponse {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    totalIssues: number;
    criticalIssues: number;
    warnings: number;
  };
}

// Export response types
export interface ExportDataResponse {
  schedule: Schedule;
  castMembers: CastMember[];
  roles: Role[];
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
}

// Constants
export const CAST_MEMBERS: CastMember[] = [
  { name: "PHIL", eligibleRoles: ["Sarge"] },
  { name: "SEAN", eligibleRoles: ["Sarge", "Potato"] },
  { name: "JAMIE", eligibleRoles: ["Potato", "Ringo"] },
  { name: "ADAM", eligibleRoles: ["Ringo", "Particle"] },
  { name: "CARY", eligibleRoles: ["Particle"] },
  { name: "JOE", eligibleRoles: ["Ringo", "Mozzie"] },
  { name: "JOSE", eligibleRoles: ["Mozzie"] },
  { name: "JOSH", eligibleRoles: ["Who"] },
  { name: "CADE", eligibleRoles: ["Who", "Ringo", "Potato"] },
  { name: "MOLLY", eligibleRoles: ["Bin", "Cornish"] },
  { name: "JASMINE", eligibleRoles: ["Bin", "Cornish"] },
  { name: "SERENA", eligibleRoles: ["Bin", "Cornish"] }
];

export const ROLES: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];

export const FEMALE_ONLY_ROLES: Role[] = ["Bin", "Cornish"];