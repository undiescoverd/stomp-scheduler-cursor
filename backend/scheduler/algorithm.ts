import { Role, Show, Assignment, CastMember } from "./types";

export interface AutoGenerateResult {
  success: boolean;
  assignments: Assignment[];
  errors?: string[];
}

export interface ConstraintResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ShowAssignment {
  [role: string]: string;
}

export class SchedulingAlgorithm {
  private shows: Show[];
  private assignments: Map<string, ShowAssignment>;
  private castMembers: CastMember[];

  constructor(shows: Show[], castMembers?: CastMember[]) {
    this.shows = shows;
    this.assignments = new Map();
    
    // Use provided cast members or fetch from company system
    this.castMembers = castMembers || [];
    
    // Initialize empty assignments for all shows
    shows.forEach(show => {
      const showAssignment: ShowAssignment = {};
      const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
      roles.forEach(role => {
        showAssignment[role] = "";
      });
      this.assignments.set(show.id, showAssignment);
    });
  }

  public async autoGenerate(): Promise<AutoGenerateResult> {
    try {
      // If no cast members provided, fetch from company system
      if (this.castMembers.length === 0) {
        try {
          const { getCastMembers } = await import("./cast_members");
          const castData = await getCastMembers();
          this.castMembers = castData.castMembers;
        } catch (error) {
          return {
            success: false,
            assignments: [],
            errors: ["Failed to load cast members from company system"]
          };
        }
      }

      // Clear existing assignments
      this.clearAllAssignments();

      // Filter out travel/day-off shows for scheduling
      const activeShows = this.shows.filter(show => show.status === "show");

      // Try multiple approaches to find a valid assignment
      for (let attempt = 0; attempt < 10; attempt++) {
        this.clearAllAssignments();
        
        if (this.generateScheduleAttempt(activeShows)) {
          const assignments = this.convertToAssignments();
          const validation = this.validateSchedule(assignments);
          
          if (validation.isValid) {
            return {
              success: true,
              assignments
            };
          }
        }
      }

      // If we couldn't find a complete solution, try a partial one
      this.clearAllAssignments();
      const partialResult = this.generatePartialSchedule(activeShows);
      
      return {
        success: partialResult.success,
        assignments: partialResult.assignments,
        errors: partialResult.errors
      };

    } catch (error) {
      return {
        success: false,
        assignments: [],
        errors: [`Algorithm error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  private generateScheduleAttempt(activeShows: Show[]): boolean {
    // Assign roles for each active show individually
    for (const show of activeShows) {
      if (!this.assignRolesForShow(show.id)) {
        return false;
      }
    }
    return true;
  }

  private assignRolesForShow(showId: string): boolean {
    const showAssignment = this.assignments.get(showId)!;
    const availablePerformers = [...this.castMembers];
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    const unassignedRoles = [...roles];

    // Shuffle roles to add randomness
    this.shuffleArray(unassignedRoles);

    // Try to assign each role
    for (const role of unassignedRoles) {
      const eligiblePerformers = availablePerformers.filter(member => 
        member.eligibleRoles.includes(role)
      );

      if (eligiblePerformers.length === 0) {
        return false; // No eligible performers for this role
      }

      // Score and select the best performer
      const scoredPerformers = eligiblePerformers.map(performer => ({
        performer,
        score: this.scoreCastMemberForShow(performer, showId)
      }));

      // Sort by score (higher is better) with some randomization
      scoredPerformers.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) < 0.1) {
          return Math.random() - 0.5;
        }
        return scoreDiff;
      });

      // Assign the best performer
      const selectedPerformer = scoredPerformers[0].performer;
      showAssignment[role] = selectedPerformer.name;

      // Remove the performer from available list
      const performerIndex = availablePerformers.findIndex(p => p.name === selectedPerformer.name);
      if (performerIndex >= 0) {
        availablePerformers.splice(performerIndex, 1);
      }
    }

    return true;
  }

  private generatePartialSchedule(activeShows: Show[]): AutoGenerateResult {
    const errors: string[] = [];
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    
    // Get roles sorted by difficulty (fewest eligible performers first)
    const rolesByDifficulty = this.getRolesByDifficulty();

    for (const role of rolesByDifficulty) {
      const eligibleCast = this.castMembers.filter(member => member.eligibleRoles.includes(role));
      
      for (const show of activeShows) {
        const showAssignment = this.assignments.get(show.id)!;
        
        if (showAssignment[role] === "") {
          // Find available cast members for this show
          const alreadyAssigned = Object.values(showAssignment).filter(name => name !== "");
          const availableCast = eligibleCast.filter(member => !alreadyAssigned.includes(member.name));
          
          if (availableCast.length > 0) {
            // Score and select the best available performer
            const scoredCast = availableCast.map(member => ({
              member,
              score: this.scoreCastMemberForShow(member, show.id)
            }));

            scoredCast.sort((a, b) => b.score - a.score);
            showAssignment[role] = scoredCast[0].member.name;
          } else {
            errors.push(`Could not assign ${role} for show on ${show.date} ${show.time}`);
          }
        }
      }
    }

    const assignments = this.convertToAssignments();
    const hasAnyAssignments = assignments.length > 0;

    return {
      success: hasAnyAssignments && errors.length === 0,
      assignments,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private clearAllAssignments(): void {
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    this.shows.forEach(show => {
      const showAssignment: ShowAssignment = {};
      roles.forEach(role => {
        showAssignment[role] = "";
      });
      this.assignments.set(show.id, showAssignment);
    });
  }

  private getRolesByDifficulty(): Role[] {
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    return [...roles].sort((a, b) => {
      const aEligible = this.castMembers.filter(member => member.eligibleRoles.includes(a)).length;
      const bEligible = this.castMembers.filter(member => member.eligibleRoles.includes(b)).length;
      return aEligible - bEligible;
    });
  }

  private scoreCastMemberForShow(member: CastMember, showId: string): number {
    let score = 0;

    // Filter active shows for scoring calculations
    const activeShows = this.shows.filter(show => show.status === "show");

    // Get current show count for this member across active shows only
    const currentShowCount = this.getCurrentShowCount(member.name, activeShows);
    const targetShowCount = Math.floor(activeShows.length * 8 / this.castMembers.length);

    // Prefer members with fewer shows (load balancing)
    if (currentShowCount < targetShowCount) {
      score += 3;
    } else if (currentShowCount > targetShowCount + 1) {
      score -= 3;
    }

    // Check consecutive shows constraint (only for active shows)
    const consecutiveCount = this.getConsecutiveShowCount(member.name, showId, activeShows);
    if (consecutiveCount >= 3) {
      score -= 5; // Heavily penalize consecutive shows
    } else if (consecutiveCount >= 2) {
      score -= 2; // Moderately penalize consecutive shows
    }

    // Add some randomization to prevent getting stuck
    score += Math.random() * 0.5;

    return score;
  }

  private getCurrentShowCount(memberName: string, activeShows?: Show[]): number {
    const showsToCheck = activeShows || this.shows.filter(show => show.status === "show");
    let count = 0;
    
    for (const show of showsToCheck) {
      const showAssignment = this.assignments.get(show.id);
      if (showAssignment) {
        for (const assignedName of Object.values(showAssignment)) {
          if (assignedName === memberName) {
            count++;
            break; // Only count once per show
          }
        }
      }
    }
    return count;
  }

  private getConsecutiveShowCount(memberName: string, currentShowId: string, activeShows?: Show[]): number {
    const showsToCheck = activeShows || this.shows.filter(show => show.status === "show");
    
    // Sort shows by date and time
    const sortedShows = [...showsToCheck].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    const currentShowIndex = sortedShows.findIndex(show => show.id === currentShowId);
    if (currentShowIndex === -1) return 0;

    let consecutiveCount = 0;
    
    // Check backwards from current show
    for (let i = currentShowIndex - 1; i >= 0; i--) {
      const show = sortedShows[i];
      const showAssignment = this.assignments.get(show.id)!;
      const isAssigned = Object.values(showAssignment).includes(memberName);
      
      if (isAssigned) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    return consecutiveCount;
  }

  private convertToAssignments(): Assignment[] {
    const assignments: Assignment[] = [];
    
    for (const [showId, showAssignment] of this.assignments) {
      for (const [role, performer] of Object.entries(showAssignment)) {
        if (performer !== "") {
          assignments.push({
            showId,
            role: role as Role,
            performer
          });
        }
      }
    }
    
    return assignments;
  }

  public validateSchedule(assignments: Assignment[]): ConstraintResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Filter active shows for validation
    const activeShows = this.shows.filter(show => show.status === "show");

    // Group assignments by show
    const showAssignments = new Map<string, Assignment[]>();
    assignments.forEach(assignment => {
      if (!showAssignments.has(assignment.showId)) {
        showAssignments.set(assignment.showId, []);
      }
      showAssignments.get(assignment.showId)!.push(assignment);
    });

    // Validate each active show
    for (const show of activeShows) {
      const showAssignmentList = showAssignments.get(show.id) || [];
      
      // Check if exactly 8 performers per show
      const uniquePerformers = new Set(showAssignmentList.map(a => a.performer));
      if (uniquePerformers.size !== 8 && showAssignmentList.length > 0) {
        if (uniquePerformers.size < 8) {
          warnings.push(`Show ${show.date} ${show.time}: Has ${uniquePerformers.size} performers, needs 8`);
        } else {
          errors.push(`Show ${show.date} ${show.time}: Has ${uniquePerformers.size} performers, must have exactly 8`);
        }
      }

      // Check if all roles are filled
      const filledRoles = new Set(showAssignmentList.map(a => a.role));
      if (filledRoles.size !== 8 && showAssignmentList.length > 0) {
        if (filledRoles.size < 8) {
          warnings.push(`Show ${show.date} ${show.time}: Has ${filledRoles.size} roles filled, needs 8`);
        }
      }

      // Check role eligibility
      for (const assignment of showAssignmentList) {
        const castMember = this.castMembers.find(m => m.name === assignment.performer);
        if (!castMember || !castMember.eligibleRoles.includes(assignment.role)) {
          errors.push(`Show ${show.date} ${show.time}: ${assignment.performer} is not eligible for role ${assignment.role}`);
        }
      }

      // Check for duplicate performers in same show
      const performerCounts = new Map<string, number>();
      showAssignmentList.forEach(assignment => {
        performerCounts.set(assignment.performer, (performerCounts.get(assignment.performer) || 0) + 1);
      });
      
      for (const [performer, count] of performerCounts) {
        if (count > 1) {
          errors.push(`Show ${show.date} ${show.time}: ${performer} is assigned multiple roles in the same show`);
        }
      }
    }

    // Check consecutive shows constraint (only for active shows)
    for (const member of this.castMembers) {
      const consecutiveCount = this.getMaxConsecutiveShows(member.name, assignments, activeShows);
      if (consecutiveCount >= 4) {
        if (consecutiveCount >= 6) {
          errors.push(`${member.name} has ${consecutiveCount} consecutive shows (critical burnout risk)`);
        } else {
          warnings.push(`${member.name} has ${consecutiveCount} consecutive shows (burnout warning)`);
        }
      }
    }

    // Check show distribution (only for active shows)
    const showCounts = this.getShowCounts(assignments, activeShows);
    for (const [performer, count] of Object.entries(showCounts)) {
      if (count < 2 && count > 0) {
        warnings.push(`${performer} only has ${count} shows (underutilized)`);
      } else if (count > Math.ceil(activeShows.length * 0.8)) {
        warnings.push(`${performer} has ${count} shows (potentially overworked)`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private getMaxConsecutiveShows(memberName: string, assignments: Assignment[], activeShows?: Show[]): number {
    const showsToCheck = activeShows || this.shows.filter(show => show.status === "show");
    
    // Build a set of show dates where this member is assigned
    const memberShowDates = new Set<string>();
    assignments.forEach(assignment => {
      if (assignment.performer === memberName) {
        const show = showsToCheck.find(s => s.id === assignment.showId);
        if (show) {
          // Create unique date-time identifier for each show
          memberShowDates.add(`${show.date}T${show.time}`);
        }
      }
    });

    if (memberShowDates.size === 0) return 0;

    // Get all unique show dates from all shows, sorted chronologically
    const allShowDateTimes = showsToCheck
      .map(show => ({
        dateTime: `${show.date}T${show.time}`,
        date: show.date,
        time: show.time
      }))
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

    // Remove duplicates while preserving order
    const uniqueShowDateTimes = [];
    const seen = new Set<string>();
    for (const show of allShowDateTimes) {
      if (!seen.has(show.dateTime)) {
        seen.add(show.dateTime);
        uniqueShowDateTimes.push(show.dateTime);
      }
    }

    let maxConsecutive = 0;
    let currentConsecutive = 0;
    let lastShowDate: Date | null = null;

    for (const dateTime of uniqueShowDateTimes) {
      const isAssigned = memberShowDates.has(dateTime);
      
      if (isAssigned) {
        const currentShowDate = new Date(dateTime);
        
        // Check if this is consecutive to the last show
        if (lastShowDate) {
          const daysDiff = Math.floor((currentShowDate.getTime() - lastShowDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // Consider consecutive if within 2 days (allows for some flexibility)
          if (daysDiff <= 2) {
            currentConsecutive++;
          } else {
            // Reset consecutive count for gaps > 2 days
            currentConsecutive = 1;
          }
        } else {
          currentConsecutive = 1;
        }
        
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        lastShowDate = currentShowDate;
      } else {
        // Reset consecutive count when performer is not assigned
        currentConsecutive = 0;
        lastShowDate = null;
      }
    }

    return maxConsecutive;
  }

  private getShowCounts(assignments: Assignment[], activeShows?: Show[]): Record<string, number> {
    const showsToCheck = activeShows || this.shows.filter(show => show.status === "show");
    const counts: Record<string, number> = {};
    
    // Initialize all cast members
    this.castMembers.forEach(member => {
      counts[member.name] = 0;
    });

    // Count shows per performer (only active shows)
    const showPerformers = new Map<string, Set<string>>();
    assignments.forEach(assignment => {
      // Only count if the show is in our active shows list
      if (showsToCheck.some(show => show.id === assignment.showId)) {
        if (!showPerformers.has(assignment.showId)) {
          showPerformers.set(assignment.showId, new Set());
        }
        showPerformers.get(assignment.showId)!.add(assignment.performer);
      }
    });

    // Count unique shows per performer
    for (const [, performers] of showPerformers) {
      for (const performer of performers) {
        counts[performer]++;
      }
    }

    return counts;
  }
}
