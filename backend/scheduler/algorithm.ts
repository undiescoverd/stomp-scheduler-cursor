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

interface ConsecutiveSequence {
  startIndex: number;
  endIndex: number;
  count: number;
  startDate: string;
  endDate: string;
}

interface PerformerShowData {
  showIndexes: Set<number>;
  sortedShows: Array<{ show: Show; index: number }>;
  maxConsecutive: number;
  sequences: ConsecutiveSequence[];
}

export class SchedulingAlgorithm {
  private shows: Show[];
  private assignments: Map<string, ShowAssignment>;
  private castMembers: CastMember[];
  
  // Cached data structures for performance
  private _sortedActiveShows: Show[] | null = null;
  private _showIndexMap: Map<string, number> | null = null;
  private _performerShowCache: Map<string, PerformerShowData> | null = null;

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

  // Clear caches when data changes
  private clearCaches(): void {
    this._sortedActiveShows = null;
    this._showIndexMap = null;
    this._performerShowCache = null;
  }

  // Get sorted active shows with caching
  private getSortedActiveShows(): Show[] {
    if (this._sortedActiveShows === null) {
      this._sortedActiveShows = this.shows
        .filter(show => show.status === "show")
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.time.localeCompare(b.time);
        });
    }
    return this._sortedActiveShows;
  }

  // Get show index mapping with caching
  private getShowIndexMap(): Map<string, number> {
    if (this._showIndexMap === null) {
      this._showIndexMap = new Map();
      const sortedShows = this.getSortedActiveShows();
      sortedShows.forEach((show, index) => {
        this._showIndexMap!.set(show.id, index);
      });
    }
    return this._showIndexMap;
  }

  // Optimized consecutive show analysis
  private analyzeConsecutiveShows(assignments: Assignment[]): Map<string, PerformerShowData> {
    if (this._performerShowCache !== null) {
      return this._performerShowCache;
    }

    const sortedShows = this.getSortedActiveShows();
    const showIndexMap = this.getShowIndexMap();
    const performerData = new Map<string, PerformerShowData>();

    // Initialize data for all cast members
    for (const member of this.castMembers) {
      performerData.set(member.name, {
        showIndexes: new Set<number>(),
        sortedShows: [],
        maxConsecutive: 0,
        sequences: []
      });
    }

    // Build performer show indexes efficiently
    for (const assignment of assignments) {
      const showIndex = showIndexMap.get(assignment.showId);
      if (showIndex !== undefined) {
        const data = performerData.get(assignment.performer);
        if (data) {
          data.showIndexes.add(showIndex);
        }
      }
    }

    // Analyze consecutive sequences for each performer
    for (const [performerName, data] of performerData) {
      if (data.showIndexes.size === 0) continue;

      // Convert to sorted array of indexes
      const sortedIndexes = Array.from(data.showIndexes).sort((a, b) => a - b);
      
      // Build show data
      data.sortedShows = sortedIndexes.map(index => ({
        show: sortedShows[index],
        index
      }));

      // Find consecutive sequences using optimized algorithm
      this.findConsecutiveSequences(data, sortedShows);
    }

    this._performerShowCache = performerData;
    return performerData;
  }

  // Optimized consecutive sequence detection
  private findConsecutiveSequences(data: PerformerShowData, sortedShows: Show[]): void {
    const sortedIndexes = Array.from(data.showIndexes).sort((a, b) => a - b);
    if (sortedIndexes.length === 0) return;

    const sequences: ConsecutiveSequence[] = [];
    let currentSequenceStart = 0;
    let maxConsecutive = 1;

    // Single pass algorithm to find consecutive sequences
    for (let i = 1; i < sortedIndexes.length; i++) {
      const currentIndex = sortedIndexes[i];
      const prevIndex = sortedIndexes[i - 1];
      
      // Check if shows are consecutive (considering date gaps)
      const isConsecutive = this.areShowsConsecutive(
        sortedShows[prevIndex],
        sortedShows[currentIndex]
      );

      if (!isConsecutive) {
        // End current sequence if it's significant
        const sequenceLength = i - currentSequenceStart;
        if (sequenceLength >= 3) {
          const startIndex = sortedIndexes[currentSequenceStart];
          const endIndex = sortedIndexes[i - 1];
          sequences.push({
            startIndex,
            endIndex,
            count: sequenceLength,
            startDate: this.formatDateForValidation(sortedShows[startIndex].date, sortedShows[startIndex].time),
            endDate: this.formatDateForValidation(sortedShows[endIndex].date, sortedShows[endIndex].time)
          });
        }
        maxConsecutive = Math.max(maxConsecutive, sequenceLength);
        currentSequenceStart = i;
      }
    }

    // Handle final sequence
    const finalSequenceLength = sortedIndexes.length - currentSequenceStart;
    if (finalSequenceLength >= 3) {
      const startIndex = sortedIndexes[currentSequenceStart];
      const endIndex = sortedIndexes[sortedIndexes.length - 1];
      sequences.push({
        startIndex,
        endIndex,
        count: finalSequenceLength,
        startDate: this.formatDateForValidation(sortedShows[startIndex].date, sortedShows[startIndex].time),
        endDate: this.formatDateForValidation(sortedShows[endIndex].date, sortedShows[endIndex].time)
      });
    }
    maxConsecutive = Math.max(maxConsecutive, finalSequenceLength);

    data.maxConsecutive = maxConsecutive;
    data.sequences = sequences;
  }

  // Optimized check for consecutive shows
  private areShowsConsecutive(show1: Show, show2: Show): boolean {
    try {
      const date1 = new Date(`${show1.date}T${show1.time}`);
      const date2 = new Date(`${show2.date}T${show2.time}`);
      const daysDiff = Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff <= 2; // Allow up to 2 days gap
    } catch (error) {
      return false;
    }
  }

  public async autoGenerate(): Promise<AutoGenerateResult> {
    try {
      // Clear caches when generating new schedule
      this.clearCaches();

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
    // Clear caches when assignments change
    this.clearCaches();
    
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

    // Check consecutive shows constraint (only for active shows) - optimized version
    const consecutiveCount = this.getConsecutiveShowCountOptimized(member.name, showId, activeShows);
    if (consecutiveCount >= 3) {
      score -= 5; // Heavily penalize consecutive shows
    } else if (consecutiveCount >= 2) {
      score -= 2; // Moderately penalize consecutive shows
    }

    // Add some randomization to prevent getting stuck
    score += Math.random() * 0.5;

    return score;
  }

  // Optimized version of consecutive show counting for scoring
  private getConsecutiveShowCountOptimized(memberName: string, currentShowId: string, activeShows?: Show[]): number {
    const showsToCheck = activeShows || this.shows.filter(show => show.status === "show");
    
    // Find current show index
    const currentShowIndex = showsToCheck.findIndex(show => show.id === currentShowId);
    if (currentShowIndex === -1) return 0;

    // Count backwards from current show
    let consecutiveCount = 0;
    for (let i = currentShowIndex - 1; i >= 0; i--) {
      const show = showsToCheck[i];
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

    // Use optimized consecutive shows analysis
    const performerData = this.analyzeConsecutiveShows(assignments);
    for (const [memberName, data] of performerData) {
      for (const sequence of data.sequences) {
        if (sequence.count >= 6) {
          const suggestions = this.getConsecutiveShowSuggestions(memberName, sequence, assignments, activeShows);
          errors.push(`${memberName} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - critical burnout risk. ${suggestions}`);
        } else if (sequence.count >= 4) {
          const suggestions = this.getConsecutiveShowSuggestions(memberName, sequence, assignments, activeShows);
          warnings.push(`${memberName} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - consider reducing workload. ${suggestions}`);
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

  private getConsecutiveShowSuggestions(memberName: string, sequence: ConsecutiveSequence, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find shows in the middle of the sequence where we could make substitutions
    const memberAssignments = assignments.filter(a => a.performer === memberName);
    const showIndexMap = this.getShowIndexMap();
    const sortedShows = this.getSortedActiveShows();
    
    // Get middle show index from the sequence
    const middleIndex = Math.floor((sequence.startIndex + sequence.endIndex) / 2);
    if (middleIndex < sortedShows.length) {
      const middleShow = sortedShows[middleIndex];
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
