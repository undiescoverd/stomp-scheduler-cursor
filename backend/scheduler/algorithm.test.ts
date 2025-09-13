import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingAlgorithm } from './algorithm';
import { Show, CastMember, Role } from './types';

describe('SchedulingAlgorithm - Critical Bug Fixes', () => {
  const defaultCastMembers: CastMember[] = [
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

  const allRoles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];

  let weekShows: Show[];

  beforeEach(() => {
    // Create a week with typical STOMP schedule including dangerous weekend pattern
    weekShows = [
      { id: "tue", date: "2024-01-02", time: "21:00", callTime: "19:00", status: "show" }, // Tuesday
      { id: "wed", date: "2024-01-03", time: "21:00", callTime: "19:00", status: "show" }, // Wednesday
      { id: "thu", date: "2024-01-04", time: "21:00", callTime: "19:00", status: "show" }, // Thursday
      { id: "fri", date: "2024-01-05", time: "21:00", callTime: "18:00", status: "show" }, // Friday
      { id: "sat_mat", date: "2024-01-06", time: "16:00", callTime: "14:00", status: "show" }, // Saturday matinee
      { id: "sat_eve", date: "2024-01-06", time: "21:00", callTime: "18:00", status: "show" }, // Saturday evening
      { id: "sun_mat", date: "2024-01-07", time: "16:00", callTime: "14:30", status: "show" }, // Sunday matinee
      { id: "sun_eve", date: "2024-01-07", time: "19:00", callTime: "18:00", status: "show" }  // Sunday evening
    ];
  });

  describe('Consecutive Show Rule', () => {
    it('should not allow more than 6 consecutive shows', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      // Run multiple attempts to ensure consistency
      for (let attempt = 0; attempt < 10; attempt++) {
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
          
          // Check every performer's consecutive show count
          for (const member of defaultCastMembers) {
            const memberShows = stageAssignments
              .filter(a => a.performer === member.name)
              .map(a => weekShows.find(s => s.id === a.showId)!)
              .filter(Boolean) // Filter out undefined shows
              .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
            
            if (memberShows.length === 0) continue;

            // Check consecutive sequences
            let maxConsecutive = 1;
            let currentConsecutive = 1;
            
            for (let i = 1; i < memberShows.length; i++) {
              const prevDate = new Date(`${memberShows[i-1].date}T${memberShows[i-1].time}`);
              const currDate = new Date(`${memberShows[i].date}T${memberShows[i].time}`);
              const daysDiff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
              
              if (daysDiff <= 2) { // Within 2 days = consecutive
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
              } else {
                currentConsecutive = 1;
              }
            }
            
            expect(maxConsecutive).toBeLessThanOrEqual(6, 
              `${member.name} has ${maxConsecutive} consecutive shows - VIOLATION! Shows: ${memberShows.map(s => `${s.date} ${s.time}`).join(', ')}`
            );
          }
        }
      }
    });

    it('should prevent 7th consecutive show violation during assignment', () => {
      const testShows = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show2", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show3", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show4", date: "2024-01-04", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show5", date: "2024-01-05", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show6", date: "2024-01-06", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show7", date: "2024-01-07", time: "19:00", callTime: "18:00", status: "show" as const }
      ];
      
      const testAlgorithm = new SchedulingAlgorithm(testShows, defaultCastMembers);
      
      // Manually assign to test prevention logic
      (testAlgorithm as any).assignments = new Map([
        ["show1", { "Sarge": "PHIL" }],
        ["show2", { "Sarge": "PHIL" }],
        ["show3", { "Sarge": "PHIL" }],
        ["show4", { "Sarge": "PHIL" }],
        ["show5", { "Sarge": "PHIL" }],
        ["show6", { "Sarge": "PHIL" }]
      ]);
      
      // This should return false - cannot assign PHIL to show7 as it would create 7 consecutive
      const canAssign = (testAlgorithm as any).canAssignPerformerToShow("PHIL", "show7");
      expect(canAssign).toBe(false, "Algorithm should prevent 7th consecutive show assignment");
    });
  });

  describe('CRITICAL BUG FIX: Weekend Double-Double Rule', () => {
    it('should NEVER allow a performer to work a double on Saturday and Sunday of the same weekend', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      for (let attempt = 0; attempt < 10; attempt++) {
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
          
          for (const member of defaultCastMembers) {
            const memberAssignments = stageAssignments.filter(a => a.performer === member.name);
            
            const showsByDate: Record<string, number> = {};
            memberAssignments.forEach(assignment => {
              const show = weekShows.find(s => s.id === assignment.showId)!;
              if (show) {
                showsByDate[show.date] = (showsByDate[show.date] || 0) + 1;
              }
            });
            
            const saturdayShows = showsByDate["2024-01-06"] || 0;
            const sundayShows = showsByDate["2024-01-07"] || 0;
            
            const isDoubleDouble = saturdayShows >= 2 && sundayShows >= 2;
            
            expect(isDoubleDouble).toBe(false, 
              `${member.name} has a Sat/Sun double-double - CRITICAL VIOLATION!`
            );
          }
        }
      }
    });

    it('should prevent weekend double-double rule violations during assignment', () => {
      const weekendShows = [
        { id: "sat_mat", date: "2024-01-06", time: "16:00", callTime: "14:00", status: "show" as const },
        { id: "sat_eve", date: "2024-01-06", time: "21:00", callTime: "18:00", status: "show" as const },
        { id: "sun_mat", date: "2024-01-07", time: "16:00", callTime: "14:30", status: "show" as const },
        { id: "sun_eve", date: "2024-01-07", time: "19:00", callTime: "18:00", status: "show" as const }
      ];
      
      const algorithm = new SchedulingAlgorithm(weekendShows, defaultCastMembers);
      
      // Manually assign performer to Sat double and one Sun show
      (algorithm as any).assignments = new Map([
        ["sat_mat", { "Sarge": "PHIL" }],
        ["sat_eve", { "Sarge": "PHIL" }], 
        ["sun_mat", { "Sarge": "PHIL" }]
      ]);
      
      // Should prevent assignment to Sunday evening (would create double-double)
      const wouldViolate = (algorithm as any).wouldViolateDoubleDoubleRule("PHIL", "sun_eve");
      expect(wouldViolate).toBe(true, "Algorithm should detect weekend double-double rule violation");
    });
  });

  describe('Weekly Limit Enforcement', () => {
    it('should never assign more than 6 shows per performer per week', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
          
          // Count unique shows per performer
          const performerShows = new Map<string, Set<string>>();
          stageAssignments.forEach(assignment => {
            if (!performerShows.has(assignment.performer)) {
              performerShows.set(assignment.performer, new Set());
            }
            performerShows.get(assignment.performer)!.add(assignment.showId);
          });
          
          for (const [performer, showSet] of performerShows) {
            const showCount = showSet.size;
            expect(showCount).toBeLessThanOrEqual(6, 
              `${performer} assigned to ${showCount} shows - exceeds weekly limit of 6`
            );
          }
        }
      }
    });
  });

  describe('RED Day Implementation', () => {
    it('should assign RED days to OFF performers', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        const offAssignments = result.assignments.filter(a => a.role === "OFF");
        const redDayAssignments = offAssignments.filter(a => a.isRedDay);
        
        expect(offAssignments.length).toBeGreaterThan(0, "Should have OFF assignments");
        expect(redDayAssignments.length).toBeGreaterThan(0, "Should have RED day assignments");
        
        // Each performer should have at most one RED day
        const redDayPerformers = new Set(redDayAssignments.map(a => a.performer));
        expect(redDayAssignments.length).toBe(redDayPerformers.size, 
          "Each performer should have at most one RED day");
      }
    });

    it('should limit RED days per show based on double-show days', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        const offAssignments = result.assignments.filter(a => a.role === "OFF");
        
        // Group by show and check RED day limits
        const showGroups = new Map<string, typeof offAssignments>();
        offAssignments.forEach(assignment => {
          if (!showGroups.has(assignment.showId)) {
            showGroups.set(assignment.showId, []);
          }
          showGroups.get(assignment.showId)!.push(assignment);
        });
        
        for (const [showId, assignments] of showGroups) {
          const show = weekShows.find(s => s.id === showId)!;
          const redDayCount = assignments.filter(a => a.isRedDay).length;
          
          // Check if it's a double-show day (Saturday/Sunday)
          const isDoubleShowDay = weekShows.filter(s => s.date === show.date).length > 1;
          const maxRed = isDoubleShowDay ? 1 : 3;
          
          expect(redDayCount).toBeLessThanOrEqual(maxRed, 
            `Show ${showId} on ${show.date} has ${redDayCount} RED days but max should be ${maxRed}`);
        }
      }
    });
  });

  describe('Load Balancing', () => {
    it('should distribute workload evenly among cast members', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
        
        // Count shows per performer
        const performerShows = new Map<string, Set<string>>();
        stageAssignments.forEach(assignment => {
          if (!performerShows.has(assignment.performer)) {
            performerShows.set(assignment.performer, new Set());
          }
          performerShows.get(assignment.performer)!.add(assignment.showId);
        });
        
        const showCounts = Array.from(performerShows.values()).map(shows => shows.size);
        const maxShows = Math.max(...showCounts);
        const minShows = Math.min(...showCounts);
        
        // Workload should be reasonably balanced
        expect(maxShows - minShows).toBeLessThanOrEqual(3, 
          `Workload imbalance too high: ${minShows}-${maxShows} shows per performer`);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should consistently produce valid schedules across multiple attempts', async () => {
      let successCount = 0;
      let violationCount = 0;
      
      for (let attempt = 0; attempt < 20; attempt++) {
        const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          successCount++;
          
          // Validate critical constraints
          const validation = algorithm.validateSchedule(result.assignments);
          const hasCriticalViolation = validation.errors.some(error => 
            error.includes("CRITICAL")
          );
          
          if (hasCriticalViolation) {
            violationCount++;
          }
        }
      }
      
      expect(successCount).toBeGreaterThan(15, "Should successfully generate schedules consistently");
      expect(violationCount).toBe(0, "Should NEVER produce critical violations");
    });

    it('should handle edge case with minimal cast', async () => {
      // Test with just enough cast to barely fill roles
      const minimalCast: CastMember[] = [
        { name: "PHIL", eligibleRoles: ["Sarge"] },
        { name: "SEAN", eligibleRoles: ["Potato"] },
        { name: "JAMIE", eligibleRoles: ["Mozzie"] },
        { name: "ADAM", eligibleRoles: ["Ringo"] },
        { name: "CARY", eligibleRoles: ["Particle"] },
        { name: "MOLLY", eligibleRoles: ["Bin"] },
        { name: "JASMINE", eligibleRoles: ["Cornish"] },
        { name: "JOSH", eligibleRoles: ["Who"] }
      ];
      
      const algorithm = new SchedulingAlgorithm(weekShows, minimalCast);
      const result = await algorithm.autoGenerate();
      
      // Should either succeed with valid constraints or fail gracefully
      if (result.success) {
        const validation = algorithm.validateSchedule(result.assignments);
        const hasViolations = validation.errors.some(error => 
          error.includes("CRITICAL")
        );
        expect(hasViolations).toBe(false, "Even with minimal cast, should not violate critical constraints");
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
      }
    });
  });
});
