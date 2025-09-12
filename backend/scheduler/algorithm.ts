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
      const showDate = this.formatDateForValidation(show.date, show.time);
      
      // Check if exactly 8 performers per show
      const uniquePerformers = new Set(showAssignmentList.map(a => a.performer));
      if (uniquePerformers.size !== 8 && showAssignmentList.length > 0) {
        if (uniquePerformers.size < 8) {
          const missingCount = 8 - uniquePerformers.size;
          warnings.push(`Show ${showDate}: Missing ${missingCount} performer${missingCount > 1 ? 's' : ''} - assign additional cast members to reach full capacity`);
        } else {
          errors.push(`Show ${showDate}: Has ${uniquePerformers.size} performers but can only have 8 - remove duplicate assignments`);
        }
      }

      // Check if all roles are filled
      const filledRoles = new Set(showAssignmentList.map(a => a.role));
      if (filledRoles.size !== 8 && showAssignmentList.length > 0) {
        if (filledRoles.size < 8) {
          const missingRoles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"]
            .filter(role => !filledRoles.has(role as Role));
          warnings.push(`Show ${showDate}: Missing roles: ${missingRoles.join(", ")} - assign performers to these roles`);
        }
      }

      // Check role eligibility with specific suggestions
      for (const assignment of showAssignmentList) {
        const castMember = this.castMembers.find(m => m.name === assignment.performer);
        if (!castMember) {
          errors.push(`Show ${showDate}: Unknown performer "${assignment.performer}" assigned to ${assignment.role} - verify performer name or add to cast list`);
        } else if (!castMember.eligibleRoles.includes(assignment.role)) {
          const eligiblePerformers = this.castMembers
            .filter(m => m.eligibleRoles.includes(assignment.role))
            .map(m => m.name);
          
          if (eligiblePerformers.length > 0) {
            errors.push(`Show ${showDate}: ${assignment.performer} cannot perform ${assignment.role} - replace with eligible performer: ${eligiblePerformers.slice(0, 3).join(", ")}${eligiblePerformers.length > 3 ? ` or ${eligiblePerformers.length - 3} others` : ""}`);
          } else {
            errors.push(`Show ${showDate}: ${assignment.performer} cannot perform ${assignment.role} - no eligible performers found for this role`);
          }
        }
      }

      // Check for duplicate performers in same show with specific suggestions
      const performerCounts = new Map<string, Assignment[]>();
      showAssignmentList.forEach(assignment => {
        if (!performerCounts.has(assignment.performer)) {
          performerCounts.set(assignment.performer, []);
        }
        performerCounts.get(assignment.performer)!.push(assignment);
      });
      
      for (const [performer, assignments] of performerCounts) {
        if (assignments.length > 1) {
          const roles = assignments.map(a => a.role);
          const otherEligiblePerformers = this.getAlternativePerformers(performer, roles, show.id);
          
          let suggestion = `reassign one of these roles to another performer`;
          if (otherEligiblePerformers.length > 0) {
            suggestion = `consider reassigning ${roles[1]} to ${otherEligiblePerformers.slice(0, 2).join(" or ")}`;
          }
          
          errors.push(`Show ${showDate}: ${performer} assigned to multiple roles (${roles.join(", ")}) - ${suggestion}`);
        }
      }
    }

    // Check consecutive shows constraint with specific suggestions
    for (const member of this.castMembers) {
      const consecutiveAnalysis = this.getDetailedConsecutiveAnalysis(member.name, assignments, activeShows);
      
      for (const sequence of consecutiveAnalysis.sequences) {
        if (sequence.count >= 6) {
          const suggestions = this.getConsecutiveShowSuggestions(member.name, sequence, assignments, activeShows);
          errors.push(`${member.name} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - critical burnout risk. ${suggestions}`);
        } else if (sequence.count >= 4) {
          const suggestions = this.getConsecutiveShowSuggestions(member.name, sequence, assignments, activeShows);
          warnings.push(`${member.name} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - consider reducing workload. ${suggestions}`);
        }
      }
    }

    // Check show distribution with specific suggestions
    const showCounts = this.getShowCounts(assignments, activeShows);
    const averageShows = activeShows.length > 0 ? activeShows.length / this.castMembers.length : 0;
    
    for (const [performer, count] of Object.entries(showCounts)) {
      if (count < 2 && count > 0 && activeShows.length >= 4) {
        const underutilizedSuggestions = this.getUnderutilizedSuggestions(performer, assignments, activeShows);
        warnings.push(`${performer} only has ${count} show${count === 1 ? '' : 's'} (underutilized) - ${underutilizedSuggestions}`);
      } else if (count > Math.ceil(averageShows * 1.5) && activeShows.length > 4) {
        const overworkedSuggestions = this.getOverworkedSuggestions(performer, assignments, activeShows);
        warnings.push(`${performer} has ${count} shows (potentially overworked) - ${overworkedSuggestions}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private formatDateForValidation(date: string, time: string): string {
    try {
      const dateObj = new Date(date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const [hours, minutes] = time.split(':');
      const timeObj = new Date();
      timeObj.setHours(parseInt(hours), parseInt(minutes));
      const timeStr = timeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      
      return `${dayName} ${monthDay} ${timeStr}`;
    } catch (error) {
      return `${date} ${time}`;
    }
  }

  private getAlternativePerformers(currentPerformer: string, roles: Role[], showId: string): string[] {
    const alternatives: string[] = [];
    
    // Get currently assigned performers in this show
    const showAssignments = this.convertToAssignments().filter(a => a.showId === showId);
    const assignedPerformers = new Set(showAssignments.map(a => a.performer));
    
    // Find alternative performers for each role (excluding current performer and already assigned)
    for (const role of roles) {
      const eligiblePerformers = this.castMembers
        .filter(member => 
          member.eligibleRoles.includes(role) && 
          member.name !== currentPerformer &&
          !assignedPerformers.has(member.name)
        )
        .map(member => member.name);
      
      alternatives.push(...eligiblePerformers);
    }
    
    return [...new Set(alternatives)]; // Remove duplicates
  }

  private getDetailedConsecutiveAnalysis(memberName: string, assignments: Assignment[], activeShows: Show[]) {
    // Build a set of show dates where this member is assigned
    const memberShowDates = new Set<string>();
    assignments.forEach(assignment => {
      if (assignment.performer === memberName) {
        const show = activeShows.find(s => s.id === assignment.showId);
        if (show) {
          memberShowDates.add(`${show.date}T${show.time}`);
        }
      }
    });

    // Get all unique show dates, sorted chronologically
    const allShowDateTimes = activeShows
      .map(show => ({
        dateTime: `${show.date}T${show.time}`,
        date: show.date,
        time: show.time,
        id: show.id
      }))
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

    const sequences: Array<{
      startDate: string;
      endDate: string;
      count: number;
      showIds: string[];
    }> = [];

    let currentSequence: { startDate: string; endDate: string; count: number; showIds: string[] } | null = null;
    let lastShowDate: Date | null = null;

    for (const show of allShowDateTimes) {
      const isAssigned = memberShowDates.has(show.dateTime);
      
      if (isAssigned) {
        const currentShowDate = new Date(show.dateTime);
        
        if (lastShowDate) {
          const daysDiff = Math.floor((currentShowDate.getTime() - lastShowDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff <= 2) {
            if (currentSequence) {
              currentSequence.count++;
              currentSequence.endDate = this.formatDateForValidation(show.date, show.time);
              currentSequence.showIds.push(show.id);
            } else {
              const prevShowIndex = allShowDateTimes.findIndex(s => s.dateTime === show.dateTime) - 1;
              const prevShow = allShowDateTimes[prevShowIndex];
              currentSequence = {
                startDate: this.formatDateForValidation(prevShow?.date || show.date, prevShow?.time || show.time),
                endDate: this.formatDateForValidation(show.date, show.time),
                count: 2,
                showIds: [prevShow?.id || show.id, show.id]
              };
            }
          } else {
            if (currentSequence && currentSequence.count >= 3) {
              sequences.push({ ...currentSequence });
            }
            currentSequence = null;
          }
        }
        
        lastShowDate = currentShowDate;
      } else {
        if (currentSequence && currentSequence.count >= 3) {
          sequences.push({ ...currentSequence });
        }
        currentSequence = null;
        lastShowDate = null;
      }
    }

    if (currentSequence && currentSequence.count >= 3) {
      sequences.push({ ...currentSequence });
    }

    return { sequences };
  }

  private getConsecutiveShowSuggestions(memberName: string, sequence: any, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find shows in the middle of the sequence where we could make substitutions
    const memberAssignments = assignments.filter(a => a.performer === memberName);
    const sequenceShows = activeShows.filter(show => 
      sequence.showIds && sequence.showIds.includes(show.id)
    );
    
    if (sequenceShows.length >= 3) {
      // Suggest replacing in the middle of the sequence
      const middleShowIndex = Math.floor(sequenceShows.length / 2);
      const middleShow = sequenceShows[middleShowIndex];
      const memberRoleInShow = memberAssignments.find(a => a.showId === middleShow.id)?.role;
      
      if (memberRoleInShow) {
        const alternatives = this.getAlternativePerformers(memberName, [memberRoleInShow], middleShow.id);
        if (alternatives.length > 0) {
          const showDate = this.formatDateForValidation(middleShow.date, middleShow.time);
          suggestions.push(`Replace ${memberName} with ${alternatives[0]} for ${memberRoleInShow} on ${showDate}`);
        }
      }
    }
    
    // If no specific suggestions, give general advice
    if (suggestions.length === 0) {
      suggestions.push("Consider redistributing some shows to other cast members");
    }
    
    return suggestions.join(". ");
  }

  private getUnderutilizedSuggestions(performer: string, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find shows where this performer is not assigned but could be
    const performerMember = this.castMembers.find(m => m.name === performer);
    if (!performerMember) return "verify performer availability";
    
    const assignedShowIds = new Set(assignments.filter(a => a.performer === performer).map(a => a.showId));
    const unassignedShows = activeShows.filter(show => !assignedShowIds.has(show.id));
    
    if (unassignedShows.length > 0) {
      // Look for roles this performer could fill in unassigned shows
      for (const show of unassignedShows.slice(0, 2)) { // Check first 2 shows
        const showAssignments = assignments.filter(a => a.showId === show.id);
        const unfilledRoles = performerMember.eligibleRoles.filter(role => 
          !showAssignments.some(a => a.role === role)
        );
        
        if (unfilledRoles.length > 0) {
          const showDate = this.formatDateForValidation(show.date, show.time);
          suggestions.push(`assign ${unfilledRoles[0]} role on ${showDate}`);
          break;
        }
      }
    }
    
    if (suggestions.length === 0) {
      suggestions.push("look for opportunities to assign additional roles");
    }
    
    return suggestions.join(", ");
  }

  private getOverworkedSuggestions(performer: string, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find this performer's assignments and suggest redistributing some
    const performerAssignments = assignments.filter(a => a.performer === performer);
    
    if (performerAssignments.length > 2) {
      // Suggest redistributing the last few assignments
      const lastAssignment = performerAssignments[performerAssignments.length - 1];
      const show = activeShows.find(s => s.id === lastAssignment.showId);
      
      if (show) {
        const alternatives = this.getAlternativePerformers(performer, [lastAssignment.role], show.id);
        if (alternatives.length > 0) {
          const showDate = this.formatDateForValidation(show.date, show.time);
          suggestions.push(`reassign ${lastAssignment.role} on ${showDate} to ${alternatives[0]}`);
        }
      }
    }
    
    if (suggestions.length === 0) {
      suggestions.push("redistribute some assignments to other cast members");
    }
    
    return suggestions.join(", ");
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
