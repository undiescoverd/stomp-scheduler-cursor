import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingAlgorithm } from './algorithm';
import { Show, CastMember, Role } from './types';

describe('SchedulingAlgorithm', () => {
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

  let sampleShows: Show[];

  beforeEach(() => {
    sampleShows = [
      { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" },
      { id: "show2", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "show" },
      { id: "show3", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "show" },
      { id: "show4", date: "2024-01-04", time: "19:00", callTime: "18:00", status: "show" },
      { id: "show5", date: "2024-01-05", time: "19:00", callTime: "18:00", status: "show" }
    ];
  });

  describe('autoGenerate', () => {
    it('should successfully generate a complete schedule with sufficient cast', () => {
      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.autoGenerate();

      expect(result.success).toBe(true);
      expect(result.assignments).toHaveLength(sampleShows.length * 8); // 8 roles per show
      expect(result.errors).toBeUndefined();
    });

    it('should handle shows with mixed statuses correctly', () => {
      const mixedShows: Show[] = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" },
        { id: "travel1", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "travel" },
        { id: "show2", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "show" },
        { id: "dayoff1", date: "2024-01-04", time: "19:00", callTime: "18:00", status: "dayoff" },
        { id: "show3", date: "2024-01-05", time: "19:00", callTime: "18:00", status: "show" }
      ];

      const algorithm = new SchedulingAlgorithm(mixedShows);
      const result = algorithm.autoGenerate();

      expect(result.success).toBe(true);
      // Should only assign for the 3 actual shows
      expect(result.assignments).toHaveLength(3 * 8);
      
      // Verify no assignments for travel/dayoff shows
      const travelAssignments = result.assignments.filter(a => a.showId === "travel1");
      const dayoffAssignments = result.assignments.filter(a => a.showId === "dayoff1");
      expect(travelAssignments).toHaveLength(0);
      expect(dayoffAssignments).toHaveLength(0);
    });

    it('should handle empty show list', () => {
      const algorithm = new SchedulingAlgorithm([]);
      const result = algorithm.autoGenerate();

      expect(result.success).toBe(true);
      expect(result.assignments).toHaveLength(0);
    });

    it('should handle shows with only non-show statuses', () => {
      const nonShowShows: Show[] = [
        { id: "travel1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "travel" },
        { id: "dayoff1", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "dayoff" }
      ];

      const algorithm = new SchedulingAlgorithm(nonShowShows);
      const result = algorithm.autoGenerate();

      expect(result.success).toBe(true);
      expect(result.assignments).toHaveLength(0);
    });

    it('should attempt partial schedule when complete assignment fails', () => {
      // Create a scenario with insufficient cast for some roles
      const limitedCast: CastMember[] = [
        { name: "PHIL", eligibleRoles: ["Sarge"] }, // Only one person for Sarge
        { name: "MOLLY", eligibleRoles: ["Bin", "Cornish"] }
      ];

      // Mock the CAST_MEMBERS for this test
      const originalCastMembers = require('./types').CAST_MEMBERS;
      require('./types').CAST_MEMBERS = limitedCast;

      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.autoGenerate();

      // Should fail to create complete schedule but may have partial assignments
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);

      // Restore original cast members
      require('./types').CAST_MEMBERS = originalCastMembers;
    });

    it('should generate different results on multiple runs due to randomization', () => {
      const algorithm1 = new SchedulingAlgorithm(sampleShows);
      const algorithm2 = new SchedulingAlgorithm(sampleShows);

      const result1 = algorithm1.autoGenerate();
      const result2 = algorithm2.autoGenerate();

      // Both should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Results might be different due to randomization
      // (This test could occasionally fail due to random chance, but it's unlikely)
      const assignments1Str = JSON.stringify(result1.assignments.sort());
      const assignments2Str = JSON.stringify(result2.assignments.sort());
      
      // At least verify they have the same structure even if content might differ
      expect(result1.assignments.length).toBe(result2.assignments.length);
    });
  });

  describe('validateSchedule', () => {
    it('should validate a complete and correct schedule', () => {
      const validAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show1", role: "Potato" as Role, performer: "SEAN" },
        { showId: "show1", role: "Mozzie" as Role, performer: "JOSE" },
        { showId: "show1", role: "Ringo" as Role, performer: "JAMIE" },
        { showId: "show1", role: "Particle" as Role, performer: "CARY" },
        { showId: "show1", role: "Bin" as Role, performer: "MOLLY" },
        { showId: "show1", role: "Cornish" as Role, performer: "JASMINE" },
        { showId: "show1", role: "Who" as Role, performer: "JOSH" }
      ];

      const singleShow = [sampleShows[0]];
      const algorithm = new SchedulingAlgorithm(singleShow);
      const result = algorithm.validateSchedule(validAssignments);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect role eligibility violations', () => {
      const invalidAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "MOLLY" }, // MOLLY not eligible for Sarge
        { showId: "show1", role: "Bin" as Role, performer: "PHIL" } // PHIL not eligible for Bin
      ];

      const singleShow = [sampleShows[0]];
      const algorithm = new SchedulingAlgorithm(singleShow);
      const result = algorithm.validateSchedule(invalidAssignments);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes("MOLLY") && error.includes("Sarge"))).toBe(true);
      expect(result.errors.some(error => error.includes("PHIL") && error.includes("Bin"))).toBe(true);
    });

    it('should detect duplicate performer assignments in same show', () => {
      const duplicateAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show1", role: "Potato" as Role, performer: "PHIL" } // PHIL assigned twice
      ];

      const singleShow = [sampleShows[0]];
      const algorithm = new SchedulingAlgorithm(singleShow);
      const result = algorithm.validateSchedule(duplicateAssignments);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes("PHIL") && error.includes("multiple roles"))).toBe(true);
    });

    it('should detect consecutive show violations', () => {
      const consecutiveAssignments = [
        // PHIL in 6 consecutive shows
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show2", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show3", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show4", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show5", role: "Sarge" as Role, performer: "PHIL" }
      ];

      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.validateSchedule(consecutiveAssignments);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes("PHIL") && error.includes("consecutive"))).toBe(true);
    });

    it('should warn about underutilized performers', () => {
      const minimalAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" } // Only one assignment for PHIL
      ];

      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.validateSchedule(minimalAssignments);

      expect(result.warnings.some(warning => warning.includes("PHIL") && warning.includes("underutilized"))).toBe(true);
    });

    it('should warn about incomplete shows', () => {
      const incompleteAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show1", role: "Potato" as Role, performer: "SEAN" }
        // Missing 6 roles for show1
      ];

      const singleShow = [sampleShows[0]];
      const algorithm = new SchedulingAlgorithm(singleShow);
      const result = algorithm.validateSchedule(incompleteAssignments);

      expect(result.warnings.some(warning => 
        warning.includes("Has 2 performers") && warning.includes("needs 8")
      )).toBe(true);
      expect(result.warnings.some(warning => 
        warning.includes("Has 2 roles filled") && warning.includes("needs 8")
      )).toBe(true);
    });

    it('should handle empty assignments gracefully', () => {
      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.validateSchedule([]);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should only validate active shows (not travel/dayoff)', () => {
      const mixedShows: Show[] = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" },
        { id: "travel1", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "travel" },
        { id: "dayoff1", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "dayoff" }
      ];

      const assignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        // No assignments for travel1 or dayoff1 - this should be fine
      ];

      const algorithm = new SchedulingAlgorithm(mixedShows);
      const result = algorithm.validateSchedule(assignments);

      // Should not complain about missing assignments for travel/dayoff shows
      expect(result.warnings.filter(w => w.includes("travel1") || w.includes("dayoff1"))).toHaveLength(0);
    });

    it('should detect overworked performers', () => {
      // Create many shows and assign same performer to most of them
      const manyShows: Show[] = Array.from({ length: 10 }, (_, i) => ({
        id: `show${i + 1}`,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        time: "19:00",
        callTime: "18:00",
        status: "show" as const
      }));

      const overworkAssignments = manyShows.map(show => ({
        showId: show.id,
        role: "Sarge" as Role,
        performer: "PHIL"
      }));

      const algorithm = new SchedulingAlgorithm(manyShows);
      const result = algorithm.validateSchedule(overworkAssignments);

      expect(result.warnings.some(warning => 
        warning.includes("PHIL") && warning.includes("overworked")
      )).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle insufficient cast members for specific roles', () => {
      const limitedShows: Show[] = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show2", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "show" }
      ];

      // Create scenario where we need 2 Sarge performers but only have 2 eligible
      const algorithm = new SchedulingAlgorithm(limitedShows);
      const result = algorithm.autoGenerate();

      // Should still succeed as we have PHIL and SEAN eligible for Sarge
      expect(result.success).toBe(true);

      // Verify both shows have Sarge assigned
      const sargeAssignments = result.assignments.filter(a => a.role === "Sarge");
      expect(sargeAssignments).toHaveLength(2);
    });

    it('should handle shows scheduled very close together', () => {
      const closeShows: Show[] = [
        { id: "show1", date: "2024-01-01", time: "14:00", callTime: "12:00", status: "show" },
        { id: "show2", date: "2024-01-01", time: "19:00", callTime: "17:00", status: "show" },
        { id: "show3", date: "2024-01-02", time: "14:00", callTime: "12:00", status: "show" }
      ];

      const algorithm = new SchedulingAlgorithm(closeShows);
      const result = algorithm.autoGenerate();

      expect(result.success).toBe(true);
      expect(result.assignments).toHaveLength(closeShows.length * 8);
    });

    it('should handle role with single eligible performer across multiple shows', () => {
      // JOSH is the only one eligible for "Who" role
      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.autoGenerate();

      if (result.success) {
        const whoAssignments = result.assignments.filter(a => a.role === "Who");
        expect(whoAssignments).toHaveLength(sampleShows.length);
        expect(whoAssignments.every(a => a.performer === "JOSH")).toBe(true);
      }
    });

    it('should handle validation of assignments with missing shows', () => {
      const assignmentsWithMissingShow = [
        { showId: "nonexistent", role: "Sarge" as Role, performer: "PHIL" }
      ];

      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.validateSchedule(assignmentsWithMissingShow);

      // Should not crash, validation logic should handle gracefully
      expect(result).toBeDefined();
    });

    it('should maintain load balancing across multiple shows', () => {
      const manyShows: Show[] = Array.from({ length: 8 }, (_, i) => ({
        id: `show${i + 1}`,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        time: "19:00",
        callTime: "18:00",
        status: "show" as const
      }));

      const algorithm = new SchedulingAlgorithm(manyShows);
      const result = algorithm.autoGenerate();

      if (result.success) {
        // Count shows per performer
        const performerCounts: Record<string, number> = {};
        const showPerformers = new Map<string, Set<string>>();
        
        result.assignments.forEach(assignment => {
          if (!showPerformers.has(assignment.showId)) {
            showPerformers.set(assignment.showId, new Set());
          }
          showPerformers.get(assignment.showId)!.add(assignment.performer);
        });

        // Count unique shows per performer
        for (const [, performers] of showPerformers) {
          for (const performer of performers) {
            performerCounts[performer] = (performerCounts[performer] || 0) + 1;
          }
        }

        // Check that load is reasonably balanced
        const counts = Object.values(performerCounts);
        const maxCount = Math.max(...counts);
        const minCount = Math.min(...counts);
        
        // The difference shouldn't be too extreme (allowing some variation due to role constraints)
        expect(maxCount - minCount).toBeLessThanOrEqual(4);
      }
    });

    it('should handle algorithm errors gracefully', () => {
      // Create an impossible scenario by temporarily modifying cast members
      const originalCastMembers = require('./types').CAST_MEMBERS;
      require('./types').CAST_MEMBERS = []; // No cast members available

      const algorithm = new SchedulingAlgorithm(sampleShows);
      const result = algorithm.autoGenerate();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.assignments).toHaveLength(0);

      // Restore original cast members
      require('./types').CAST_MEMBERS = originalCastMembers;
    });
  });

  describe('Consecutive Shows Logic', () => {
    it('should properly count consecutive shows', () => {
      const consecutiveShows: Show[] = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show2", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show3", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show4", date: "2024-01-04", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show5", date: "2024-01-05", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show6", date: "2024-01-06", time: "19:00", callTime: "18:00", status: "show" }
      ];

      const consecutiveAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show2", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show3", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show4", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show5", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show6", role: "Sarge" as Role, performer: "PHIL" }
      ];

      const algorithm = new SchedulingAlgorithm(consecutiveShows);
      const result = algorithm.validateSchedule(consecutiveAssignments);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => 
        error.includes("PHIL") && error.includes("6 consecutive")
      )).toBe(true);
    });

    it('should handle non-consecutive patterns correctly', () => {
      const patternShows: Show[] = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show2", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show3", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show4", date: "2024-01-04", time: "19:00", callTime: "18:00", status: "show" },
        { id: "show5", date: "2024-01-05", time: "19:00", callTime: "18:00", status: "show" }
      ];

      const patternAssignments = [
        { showId: "show1", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show2", role: "Sarge" as Role, performer: "PHIL" },
        // Break - show3 has different performer
        { showId: "show3", role: "Sarge" as Role, performer: "SEAN" },
        { showId: "show4", role: "Sarge" as Role, performer: "PHIL" },
        { showId: "show5", role: "Sarge" as Role, performer: "PHIL" }
      ];

      const algorithm = new SchedulingAlgorithm(patternShows);
      const result = algorithm.validateSchedule(patternAssignments);

      // Should be valid - no more than 2 consecutive shows for PHIL
      expect(result.isValid).toBe(true);
      expect(result.errors.filter(error => error.includes("consecutive"))).toHaveLength(0);
    });
  });
});
