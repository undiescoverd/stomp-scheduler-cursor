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
          const dateTimeA = new Date(`${a.date}T${a.time}`);
          const dateTimeB = new Date(`${b.date}T${b.time}`);
          return dateTimeA.getTime() - dateTimeB.getTime();
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

  // CRITICAL FIX: Check if assigning performer to show would violate consecutive show rule
  private canAssignPerformerToShow(performer: string, showId: string): boolean {
    const sortedShows = this.getSortedActiveShows();
    const showIndexMap = this.getShowIndexMap();
    
    const targetIndex = showIndexMap.get(showId);
    if (targetIndex === undefined) return false;

    // Get performer's current assignments (only show roles, not OFF)
    const performerShows = new Set<string>();
    for (const [currentShowId, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          performerShows.add(currentShowId);
          break; // Only count once per show
        }
      }
    }

    // Convert to sorted indices
    const performerShowIndices = Array.from(performerShows)
      .map(showId => showIndexMap.get(showId))
      .filter(index => index !== undefined)
      .sort((a, b) => a! - b!);

    // Check consecutive shows with the new assignment
    const newIndices = [...performerShowIndices, targetIndex].sort((a, b) => a - b);
    
    // Find the longest consecutive sequence
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    
    for (let i = 1; i < newIndices.length; i++) {
      const prevShow = sortedShows[newIndices[i - 1]];
      const currentShow = sortedShows[newIndices[i]];
      
      if (this.areShowsConsecutive(prevShow, currentShow)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
      
      // HARD STOP: Never allow more than 3 consecutive shows
      if (maxConsecutive > 3) {
        return false;
      }
    }
    
    return true;
  }

  // CRITICAL FIX: Check weekend 4-show rule (Friday-Sunday pattern)
  private wouldViolateWeekendRule(performer: string, showId: string): boolean {
    const sortedShows = this.getSortedActiveShows();
    const targetShow = sortedShows.find(s => s.id === showId);
    if (!targetShow) return false;

    // Get performer's current shows
    const performerShows: Show[] = [];
    for (const [currentShowId, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          const show = sortedShows.find(s => s.id === currentShowId);
          if (show) {
            performerShows.push(show);
          }
          break;
        }
      }
    }

    // Add the potential new show
    const allShows = [...performerShows, targetShow];
    
    // Group shows by date
    const showsByDate: Record<string, Show[]> = {};
    allShows.forEach(show => {
      if (!showsByDate[show.date]) {
        showsByDate[show.date] = [];
      }
      showsByDate[show.date].push(show);
    });

    // Check for Friday-Saturday-Sunday pattern with 4+ shows
    const dates = Object.keys(showsByDate).sort();
    
    for (let i = 0; i < dates.length - 2; i++) {
      const date1 = new Date(dates[i]);
      const date2 = new Date(dates[i + 1]);
      const date3 = new Date(dates[i + 2]);
      
      const day1 = date1.getDay();
      const day2 = date2.getDay();
      const day3 = date3.getDay();
      
      // Check if it's a Friday-Saturday-Sunday pattern
      if (day1 === 5 && day2 === 6 && day3 === 0) {
        const totalShows = 
          showsByDate[dates[i]].length +
          showsByDate[dates[i + 1]].length +
          showsByDate[dates[i + 2]].length;
        
        // HARD STOP: Never allow 4+ shows over Friday-Sunday
        if (totalShows >= 4) {
          return true;
        }
      }
    }
    
    return false;
  }

  // Check if performer has exceeded weekly show limit
  private hasExceededWeeklyLimit(performer: string): boolean {
    let showCount = 0;
    for (const [, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          showCount++;
          break; // Only count once per show
        }
      }
    }
    return showCount >= 6; // Maximum 6 shows per week
  }

  // Check if performer is already assigned to this show
  private isPerformerAssignedToShow(performer: string, showId: string): boolean {
    const showAssignment = this.assignments.get(showId);
    if (!showAssignment) return false;
    
    return Object.values(showAssignment).includes(performer);
  }

  // Get current show count for load balancing
  private getCurrentShowCount(performer: string): number {
    let count = 0;
    for (const [, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          count++;
          break; // Only count once per show
        }
      }
    }
    return count;
  }

  public async autoGenerate(): Promise<AutoGenerateResult> {
    try {
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

      // Try multiple attempts to find a valid assignment
      for (let attempt = 0; attempt < 50; attempt++) {
        this.clearAllAssignments();
        
        if (this.generateScheduleAttempt()) {
          const assignments = this.convertToAssignments();
          const validation = this.validateSchedule(assignments);
          
          if (validation.isValid) {
            // Add RED day assignments
            const finalAssignments = this.assignRedDays(assignments);
            return {
              success: true,
              assignments: finalAssignments
            };
          }
        }
      }

      // If we couldn't find a complete solution, try a partial one
      this.clearAllAssignments();
      const partialResult = this.generatePartialSchedule();
      
      if (partialResult.success) {
        const finalAssignments = this.assignRedDays(partialResult.assignments);
        return {
          success: true,
          assignments: finalAssignments
        };
      }

      return partialResult;

    } catch (error) {
      return {
        success: false,
        assignments: [],
        errors: [`Algorithm error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  private generateScheduleAttempt(): boolean {
    const sortedShows = this.getSortedActiveShows();
    
    // Randomize order of shows and roles to avoid getting stuck in patterns
    const shuffledShows = [...sortedShows].sort(() => Math.random() - 0.5);
    
    for (const show of shuffledShows) {
      if (!this.assignRolesForShow(show.id)) {
        return false;
      }
    }
    return true;
  }

  private assignRolesForShow(showId: string): boolean {
    const showAssignment = this.assignments.get(showId)!;
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    
    // Randomize role order to avoid patterns
    const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);

    // Get roles sorted by difficulty (fewest eligible performers first)
    const rolesByDifficulty = shuffledRoles.sort((a, b) => {
      const aEligible = this.castMembers.filter(member => member.eligibleRoles.includes(a)).length;
      const bEligible = this.castMembers.filter(member => member.eligibleRoles.includes(b)).length;
      return aEligible - bEligible;
    });

    for (const role of rolesByDifficulty) {
      const eligiblePerformers = this.castMembers
        .filter(member => member.eligibleRoles.includes(role))
        .filter(member => {
          // CHECK 1: Not already assigned to this show
          if (this.isPerformerAssignedToShow(member.name, showId)) {
            return false;
          }
          
          // CHECK 2: Won't create consecutive show violation (max 3)
          if (!this.canAssignPerformerToShow(member.name, showId)) {
            return false;
          }
          
          // CHECK 3: Won't create weekend 4-show violation
          if (this.wouldViolateWeekendRule(member.name, showId)) {
            return false;
          }
          
          // CHECK 4: Haven't exceeded weekly limit (max 6 shows)
          if (this.hasExceededWeeklyLimit(member.name)) {
            return false;
          }
          
          return true;
        })
        .sort((a, b) => {
          // Prioritize by show count (balance workload) with randomization
          const aCount = this.getCurrentShowCount(a.name);
          const bCount = this.getCurrentShowCount(b.name);
          const countDiff = aCount - bCount;
          
          // If counts are close, add randomization
          if (Math.abs(countDiff) <= 1) {
            return Math.random() - 0.5;
          }
          
          return countDiff;
        });

      if (eligiblePerformers.length === 0) {
        return false; // No eligible performers for this role
      }

      // Assign the best performer
      showAssignment[role] = eligiblePerformers[0].name;
    }

    return true;
  }

  private generatePartialSchedule(): AutoGenerateResult {
    const errors: string[] = [];
    
    const rolesByDifficulty = this.getRolesByDifficulty();
    const sortedActiveShows = this.getSortedActiveShows();

    for (const role of rolesByDifficulty) {
      const eligibleCast = this.castMembers.filter(member => member.eligibleRoles.includes(role));
      
      for (const show of sortedActiveShows) {
        const showAssignment = this.assignments.get(show.id)!;
        
        if (showAssignment[role] === "") {
          const availableCast = eligibleCast.filter(member => {
            return !this.isPerformerAssignedToShow(member.name, show.id) &&
                   this.canAssignPerformerToShow(member.name, show.id) &&
                   !this.wouldViolateWeekendRule(member.name, show.id) &&
                   !this.hasExceededWeeklyLimit(member.name);
          });
          
          if (availableCast.length > 0) {
            const sortedCast = availableCast.sort((a, b) => {
              const aCount = this.getCurrentShowCount(a.name);
              const bCount = this.getCurrentShowCount(b.name);
              return aCount - bCount;
            });
            
            showAssignment[role] = sortedCast[0].name;
          } else {
            errors.push(`Could not assign ${role} for show on ${show.date} ${show.time} - all constraints violated`);
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

  // Assign RED days to OFF performers
  private assignRedDays(assignments: Assignment[]): Assignment[] {
    const sortedShows = this.getSortedActiveShows();
    
    // Create OFF assignments for performers not on stage
    const finalAssignments = [...assignments];
    const redDayCount: Record<string, boolean> = {};
    
    // Group shows by date to identify double-show days
    const showsByDate: Record<string, Show[]> = {};
    sortedShows.forEach(show => {
      if (!showsByDate[show.date]) {
        showsByDate[show.date] = [];
      }
      showsByDate[show.date].push(show);
    });

    // Sort dates: single-show days first for RED day priority
    const sortedDates = Object.keys(showsByDate).sort((a, b) => {
      const aDouble = showsByDate[a].length > 1;
      const bDouble = showsByDate[b].length > 1;
      if (aDouble !== bDouble) return aDouble ? 1 : -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    // Assign OFF and RED days
    sortedShows.forEach(show => {
      const showAssignments = assignments.filter(a => a.showId === show.id);
      const assignedPerformers = new Set(showAssignments.map(a => a.performer));
      
      const offPerformers = this.castMembers
        .map(member => member.name)
        .filter(name => !assignedPerformers.has(name));

      // Determine max RED performers for this show
      const isDoubleShowDay = showsByDate[show.date].length > 1;
      const maxRedPerShow = isDoubleShowDay ? 1 : 3; // Max 3 RED on single days, 1 on double
      
      let redAssigned = 0;
      
      offPerformers.forEach(performer => {
        const isRedDay = !redDayCount[performer] && redAssigned < maxRedPerShow;
        
        finalAssignments.push({
          showId: show.id,
          role: "OFF",
          performer: performer,
          isRedDay: isRedDay
        });
        
        if (isRedDay) {
          redDayCount[performer] = true;
          redAssigned++;
        }
      });
    });

    return finalAssignments;
  }

  private clearAllAssignments(): void {
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

  private convertToAssignments(): Assignment[] {
    const assignments: Assignment[] = [];
    
    for (const [showId, showAssignment] of this.assignments) {
      for (const [role, performer] of Object.entries(showAssignment)) {
        if (performer !== "") {
          assignments.push({
            showId,
            role: role as Role,
            performer,
            isRedDay: false
          });
        }
      }
    }
    
    return assignments;
  }

  // Optimized consecutive show analysis for validation
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

    // Build performer show indexes efficiently (only for show roles, not OFF)
    for (const assignment of assignments) {
      if (assignment.role !== "OFF") {
        const showIndex = showIndexMap.get(assignment.showId);
        if (showIndex !== undefined) {
          const data = performerData.get(assignment.performer);
          if (data) {
            data.showIndexes.add(showIndex);
          }
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
      
      // Filter only stage assignments (not OFF)
      const stageAssignments = showAssignmentList.filter(a => a.role !== "OFF");
      
      // Check if exactly 8 performers per show
      const uniquePerformers = new Set(stageAssignments.map(a => a.performer));
      if (uniquePerformers.size !== 8 && stageAssignments.length > 0) {
        if (uniquePerformers.size < 8) {
          const missingCount = 8 - uniquePerformers.size;
          warnings.push(`Show ${showDate}: Missing ${missingCount} performer${missingCount > 1 ? 's' : ''} - assign additional cast members to reach full capacity`);
        } else {
          errors.push(`Show ${showDate}: Has ${uniquePerformers.size} performers but can only have 8 - remove duplicate assignments`);
        }
      }

      // Check if all roles are filled
      const filledRoles = new Set(stageAssignments.map(a => a.role));
      if (filledRoles.size !== 8 && stageAssignments.length > 0) {
        if (filledRoles.size < 8) {
          const missingRoles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"]
            .filter(role => !filledRoles.has(role as Role));
          warnings.push(`Show ${showDate}: Missing roles: ${missingRoles.join(", ")} - assign performers to these roles`);
        }
      }

      // Check role eligibility with specific suggestions
      for (const assignment of stageAssignments) {
        const castMember = this.castMembers.find(m => m.name === assignment.performer);
        if (!castMember) {
          errors.push(`Show ${showDate}: Unknown performer "${assignment.performer}" assigned to ${assignment.role} - verify performer name or add to cast list`);
        } else if (!castMember.eligibleRoles.includes(assignment.role as Role)) {
          const eligiblePerformers = this.castMembers
            .filter(m => m.eligibleRoles.includes(assignment.role as Role))
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
      stageAssignments.forEach(assignment => {
        if (!performerCounts.has(assignment.performer)) {
          performerCounts.set(assignment.performer, []);
        }
        performerCounts.get(assignment.performer)!.push(assignment);
      });
      
      for (const [performer, duplicateAssignments] of performerCounts) {
        if (duplicateAssignments.length > 1) {
          const roles = duplicateAssignments.map(a => a.role);
          const otherEligiblePerformers = this.getAlternativePerformers(performer, roles as Role[], show.id);
          
          let suggestion = `reassign one of these roles to another performer`;
          if (otherEligiblePerformers.length > 0) {
            suggestion = `consider reassigning ${roles[1]} to ${otherEligiblePerformers.slice(0, 2).join(" or ")}`;
          }
          
          errors.push(`Show ${showDate}: ${performer} assigned to multiple roles (${roles.join(", ")}) - ${suggestion}`);
        }
      }
    }

    // CRITICAL: Use optimized consecutive shows analysis
    const performerData = this.analyzeConsecutiveShows(assignments);
    for (const [memberName, data] of performerData) {
      for (const sequence of data.sequences) {
        if (sequence.count >= 6) {
          const suggestions = this.getConsecutiveShowSuggestions(memberName, sequence, assignments, activeShows);
          errors.push(`${memberName} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - CRITICAL VIOLATION. ${suggestions}`);
        } else if (sequence.count >= 4) {
          const suggestions = this.getConsecutiveShowSuggestions(memberName, sequence, assignments, activeShows);
          errors.push(`${memberName} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - exceeds maximum of 3. ${suggestions}`);
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
    const showAssignments = this.convertToAssignments().filter(a => a.showId === showId && a.role !== "OFF");
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
    const memberAssignments = assignments.filter(a => a.performer === memberName && a.role !== "OFF");
    const showIndexMap = this.getShowIndexMap();
    const sortedShows = this.getSortedActiveShows();
    
    // Get middle show index from the sequence
    const middleIndex = Math.floor((sequence.startIndex + sequence.endIndex) / 2);
    if (middleIndex < sortedShows.length) {
      const middleShow = sortedShows[middleIndex];
      const memberRoleInShow = memberAssignments.find(a => a.showId === middleShow.id)?.role;
      
      if (memberRoleInShow && memberRoleInShow !== "OFF") {
        const alternatives = this.getAlternativePerformers(memberName, [memberRoleInShow as Role], middleShow.id);
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
    
    const assignedShowIds = new Set(assignments.filter(a => a.performer === performer && a.role !== "OFF").map(a => a.showId));
    const unassignedShows = activeShows.filter(show => !assignedShowIds.has(show.id));
    
    if (unassignedShows.length > 0) {
      // Look for roles this performer could fill in unassigned shows
      for (const show of unassignedShows.slice(0, 2)) { // Check first 2 shows
        const showAssignments = assignments.filter(a => a.showId === show.id && a.role !== "OFF");
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
    const performerAssignments = assignments.filter(a => a.performer === performer && a.role !== "OFF");
    
    if (performerAssignments.length > 2) {
      // Suggest redistributing the last few assignments
      const lastAssignment = performerAssignments[performerAssignments.length - 1];
      const show = activeShows.find(s => s.id === lastAssignment.showId);
      
      if (show) {
        const alternatives = this.getAlternativePerformers(performer, [lastAssignment.role as Role], show.id);
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

    // Count shows per performer (only active shows, only stage roles)
    const showPerformers = new Map<string, Set<string>>();
    assignments.forEach(assignment => {
      // Only count if the show is in our active shows list and it's not an OFF assignment
      if (assignment.role !== "OFF" && showsToCheck.some(show => show.id === assignment.showId)) {
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
