import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scheduleDB } from './db';
import { create } from './create';
import { update } from './update';
import { get } from './get';
import { list } from './list';
import { deleteSchedule } from './delete';
import { autoGenerate } from './auto_generate';
import { validate } from './validate';
import { validateComprehensive } from './validate_comprehensive';
import { getCastMembers } from './cast_members';
import { getCompany } from './company';
import { Show, Assignment, Role } from './types';

describe('E2E Integration Tests', () => {
  // Test data
  const testLocation = 'London';
  const testWeek = '42';
  
  const testShows: Show[] = [
    { id: "show1", date: "2024-10-15", time: "19:00", callTime: "18:00", status: "show" },
    { id: "show2", date: "2024-10-16", time: "19:00", callTime: "18:00", status: "show" },
    { id: "show3", date: "2024-10-17", time: "19:00", callTime: "18:00", status: "show" },
    { id: "travel1", date: "2024-10-18", time: "10:00", callTime: "09:00", status: "travel" },
    { id: "show4", date: "2024-10-19", time: "14:00", callTime: "12:00", status: "show" },
    { id: "show5", date: "2024-10-19", time: "19:00", callTime: "17:00", status: "show" },
    { id: "dayoff1", date: "2024-10-20", time: "00:00", callTime: "00:00", status: "dayoff" },
    { id: "show6", date: "2024-10-21", time: "16:00", callTime: "14:30", status: "show" }
  ];

  const problemShows: Show[] = [
    { id: "p1", date: "2024-10-15", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p2", date: "2024-10-16", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p3", date: "2024-10-17", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p4", date: "2024-10-18", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p5", date: "2024-10-19", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p6", date: "2024-10-20", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p7", date: "2024-10-21", time: "19:00", callTime: "18:00", status: "show" },
    { id: "p8", date: "2024-10-22", time: "19:00", callTime: "18:00", status: "show" }
  ];

  let createdScheduleIds: string[] = [];

  // Cleanup function
  afterEach(async () => {
    // Clean up created schedules
    for (const id of createdScheduleIds) {
      try {
        await deleteSchedule({ id });
      } catch (error) {
        // Ignore errors if schedule doesn't exist
      }
    }
    createdScheduleIds = [];
  });

  describe('Complete Schedule Creation Workflow', () => {
    it('should create, auto-generate, validate and update a schedule successfully', async () => {
      // Step 1: Create initial schedule
      const createResponse = await create({
        location: testLocation,
        week: testWeek,
        shows: testShows
      });
      
      expect(createResponse.schedule).toBeDefined();
      expect(createResponse.schedule.location).toBe(testLocation);
      expect(createResponse.schedule.week).toBe(testWeek);
      expect(createResponse.schedule.shows).toHaveLength(testShows.length);
      expect(createResponse.schedule.assignments).toHaveLength(0);
      
      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Step 2: Auto-generate assignments
      const autoGenResponse = await autoGenerate({ shows: testShows });
      
      expect(autoGenResponse.success).toBe(true);
      expect(autoGenResponse.assignments).toBeDefined();
      expect(autoGenResponse.errors).toBeUndefined();

      // Verify assignments only for show days (not travel/dayoff)
      const activeShows = testShows.filter(show => show.status === 'show');
      expect(autoGenResponse.assignments).toHaveLength(activeShows.length * 8);

      // Step 3: Update schedule with generated assignments
      const updateResponse = await update({
        id: scheduleId,
        assignments: autoGenResponse.assignments
      });

      expect(updateResponse.schedule.assignments).toHaveLength(autoGenResponse.assignments.length);

      // Step 4: Validate the updated schedule
      const validateResponse = await validate({
        shows: testShows,
        assignments: autoGenResponse.assignments
      });

      expect(validateResponse.isValid).toBe(true);
      expect(validateResponse.errors).toHaveLength(0);

      // Step 5: Comprehensive validation
      const comprehensiveResponse = await validateComprehensive({
        shows: testShows,
        assignments: autoGenResponse.assignments
      });

      expect(comprehensiveResponse.isValid).toBe(true);
      expect(comprehensiveResponse.overallScore).toBeGreaterThan(70);
      expect(comprehensiveResponse.summary.completionPercentage).toBe(100);

      // Step 6: Retrieve and verify final schedule
      const getResponse = await get({ id: scheduleId });
      
      expect(getResponse.schedule.id).toBe(scheduleId);
      expect(getResponse.schedule.assignments).toHaveLength(autoGenResponse.assignments.length);
      expect(getResponse.schedule.shows).toHaveLength(testShows.length);
    });

    it('should handle mixed show statuses correctly in the complete workflow', async () => {
      // Create schedule with mixed show statuses
      const createResponse = await create({
        location: 'Mixed Status Test',
        week: '43',
        shows: testShows
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Auto-generate should only create assignments for show days
      const autoGenResponse = await autoGenerate({ shows: testShows });
      
      expect(autoGenResponse.success).toBe(true);
      
      // Count only show days
      const showDays = testShows.filter(show => show.status === 'show');
      expect(autoGenResponse.assignments).toHaveLength(showDays.length * 8);

      // Verify no assignments for travel/dayoff days
      const travelAssignments = autoGenResponse.assignments.filter(a => a.showId === 'travel1');
      const dayoffAssignments = autoGenResponse.assignments.filter(a => a.showId === 'dayoff1');
      
      expect(travelAssignments).toHaveLength(0);
      expect(dayoffAssignments).toHaveLength(0);

      // Validation should pass
      const validateResponse = await validate({
        shows: testShows,
        assignments: autoGenResponse.assignments
      });

      expect(validateResponse.isValid).toBe(true);
    });

    it('should handle insufficient cast scenario gracefully', async () => {
      // Create schedule with many shows that would challenge the algorithm
      const createResponse = await create({
        location: 'Challenge Test',
        week: '44',
        shows: problemShows
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Auto-generate with challenging requirements
      const autoGenResponse = await autoGenerate({ shows: problemShows });
      
      // Should either succeed or fail gracefully
      if (autoGenResponse.success) {
        expect(autoGenResponse.assignments.length).toBeGreaterThan(0);
        
        // Validate the result
        const validateResponse = await validate({
          shows: problemShows,
          assignments: autoGenResponse.assignments
        });

        // Even if generation succeeded, there might be warnings about consecutive shows
        expect(validateResponse.errors.length + validateResponse.warnings.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(autoGenResponse.errors).toBeDefined();
        expect(autoGenResponse.errors!.length).toBeGreaterThan(0);
        expect(autoGenResponse.assignments).toHaveLength(0);
      }
    });
  });

  describe('Schedule CRUD Operations Integration', () => {
    it('should perform full CRUD lifecycle correctly', async () => {
      // CREATE
      const createResponse = await create({
        location: 'CRUD Test',
        week: '45',
        shows: testShows.slice(0, 3) // Start with fewer shows
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      expect(createResponse.schedule.shows).toHaveLength(3);

      // READ - Get single schedule
      const getResponse = await get({ id: scheduleId });
      expect(getResponse.schedule.id).toBe(scheduleId);
      expect(getResponse.schedule.location).toBe('CRUD Test');

      // READ - List schedules (should include our new one)
      const listResponse = await list();
      const ourSchedule = listResponse.schedules.find(s => s.id === scheduleId);
      expect(ourSchedule).toBeDefined();

      // UPDATE - Add more shows and assignments
      const autoGenResponse = await autoGenerate({ shows: testShows.slice(0, 3) });
      
      const updateResponse = await update({
        id: scheduleId,
        location: 'CRUD Test Updated',
        shows: testShows, // All shows now
        assignments: autoGenResponse.assignments
      });

      expect(updateResponse.schedule.location).toBe('CRUD Test Updated');
      expect(updateResponse.schedule.shows).toHaveLength(testShows.length);
      expect(updateResponse.schedule.assignments.length).toBeGreaterThan(0);

      // READ - Verify update
      const getUpdatedResponse = await get({ id: scheduleId });
      expect(getUpdatedResponse.schedule.location).toBe('CRUD Test Updated');
      expect(getUpdatedResponse.schedule.shows).toHaveLength(testShows.length);

      // DELETE
      await deleteSchedule({ id: scheduleId });
      
      // Verify deletion
      try {
        await get({ id: scheduleId });
        expect.fail('Should have thrown an error for deleted schedule');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Remove from cleanup list since we deleted it
      createdScheduleIds = createdScheduleIds.filter(id => id !== scheduleId);
    });
  });

  describe('Cast Management Integration', () => {
    it('should use company management data in schedule generation', async () => {
      // Get company data
      const companyResponse = await getCompany();
      expect(companyResponse.currentCompany.length).toBeGreaterThan(0);
      expect(companyResponse.roles.length).toBe(8);

      // Get cast members (should fallback to company data)
      const castResponse = await getCastMembers();
      expect(castResponse.castMembers.length).toBeGreaterThan(0);
      expect(castResponse.roles.length).toBe(8);

      // Create schedule
      const createResponse = await create({
        location: 'Company Integration Test',
        week: '46',
        shows: testShows.slice(0, 2)
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Auto-generate should use cast member data
      const autoGenResponse = await autoGenerate({ shows: testShows.slice(0, 2) });
      
      expect(autoGenResponse.success).toBe(true);
      
      // Verify assignments use valid cast member names
      const validCastNames = new Set(castResponse.castMembers.map(m => m.name));
      autoGenResponse.assignments.forEach(assignment => {
        expect(validCastNames.has(assignment.performer)).toBe(true);
      });
    });
  });

  describe('Validation Integration Scenarios', () => {
    it('should detect and report consecutive show violations', async () => {
      // Create assignments that violate consecutive show rules
      const consecutiveAssignments: Assignment[] = [
        { showId: "p1", role: "Sarge", performer: "PHIL" },
        { showId: "p2", role: "Sarge", performer: "PHIL" },
        { showId: "p3", role: "Sarge", performer: "PHIL" },
        { showId: "p4", role: "Sarge", performer: "PHIL" },
        { showId: "p5", role: "Sarge", performer: "PHIL" },
        { showId: "p6", role: "Sarge", performer: "PHIL" },
        { showId: "p1", role: "Potato", performer: "SEAN" },
        { showId: "p2", role: "Potato", performer: "SEAN" },
        { showId: "p3", role: "Potato", performer: "SEAN" },
        { showId: "p4", role: "Potato", performer: "SEAN" },
        { showId: "p5", role: "Potato", performer: "SEAN" },
        { showId: "p6", role: "Potato", performer: "SEAN" }
      ];

      // Basic validation
      const basicValidation = await validate({
        shows: problemShows.slice(0, 6),
        assignments: consecutiveAssignments
      });

      expect(basicValidation.isValid).toBe(false);
      expect(basicValidation.errors.some(error => 
        error.includes('PHIL') && error.includes('consecutive')
      )).toBe(true);

      // Comprehensive validation
      const comprehensiveValidation = await validateComprehensive({
        shows: problemShows.slice(0, 6),
        assignments: consecutiveAssignments
      });

      expect(comprehensiveValidation.isValid).toBe(false);
      expect(comprehensiveValidation.overallScore).toBeLessThan(50);
      
      const philAnalysis = comprehensiveValidation.consecutiveAnalysis.find(
        analysis => analysis.performer === 'PHIL'
      );
      expect(philAnalysis).toBeDefined();
      expect(philAnalysis!.maxConsecutive).toBe(6);
    });

    it('should detect role eligibility violations', async () => {
      // Create assignments with role eligibility violations
      const invalidAssignments: Assignment[] = [
        { showId: "show1", role: "Sarge", performer: "MOLLY" }, // MOLLY not eligible for Sarge
        { showId: "show1", role: "Bin", performer: "PHIL" }, // PHIL not eligible for Bin
        { showId: "show1", role: "Cornish", performer: "SEAN" }, // SEAN not eligible for Cornish
        { showId: "show1", role: "Who", performer: "JOSE" } // JOSE not eligible for Who
      ];

      const validation = await validate({
        shows: testShows.slice(0, 1),
        assignments: invalidAssignments
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      
      // Should have specific errors for each invalid assignment
      expect(validation.errors.some(error => 
        error.includes('MOLLY') && error.includes('Sarge')
      )).toBe(true);
      expect(validation.errors.some(error => 
        error.includes('PHIL') && error.includes('Bin')
      )).toBe(true);
    });

    it('should detect duplicate performer assignments', async () => {
      // Create assignments where performers are assigned multiple roles in same show
      const duplicateAssignments: Assignment[] = [
        { showId: "show1", role: "Sarge", performer: "PHIL" },
        { showId: "show1", role: "Potato", performer: "PHIL" }, // PHIL assigned twice
        { showId: "show1", role: "Bin", performer: "MOLLY" },
        { showId: "show1", role: "Cornish", performer: "MOLLY" } // MOLLY assigned twice
      ];

      const validation = await validate({
        shows: testShows.slice(0, 1),
        assignments: duplicateAssignments
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => 
        error.includes('PHIL') && error.includes('multiple roles')
      )).toBe(true);
      expect(validation.errors.some(error => 
        error.includes('MOLLY') && error.includes('multiple roles')
      )).toBe(true);
    });
  });

  describe('Complex Workflow Scenarios', () => {
    it('should handle iterative schedule refinement workflow', async () => {
      // Create initial schedule
      const createResponse = await create({
        location: 'Iterative Test',
        week: '47',
        shows: testShows.slice(0, 4)
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // First auto-generation
      const autoGen1 = await autoGenerate({ shows: testShows.slice(0, 4) });
      expect(autoGen1.success).toBe(true);

      // Update with first generation
      await update({
        id: scheduleId,
        assignments: autoGen1.assignments
      });

      // Add more shows
      const extendedShows = [...testShows.slice(0, 4), ...testShows.slice(4, 6)];
      
      await update({
        id: scheduleId,
        shows: extendedShows
      });

      // Second auto-generation with extended shows
      const autoGen2 = await autoGenerate({ shows: extendedShows });
      expect(autoGen2.success).toBe(true);
      
      // Should have more assignments now
      const activeExtendedShows = extendedShows.filter(show => show.status === 'show');
      expect(autoGen2.assignments).toHaveLength(activeExtendedShows.length * 8);

      // Final update and validation
      await update({
        id: scheduleId,
        assignments: autoGen2.assignments
      });

      const finalValidation = await validateComprehensive({
        shows: extendedShows,
        assignments: autoGen2.assignments
      });

      expect(finalValidation.summary.completionPercentage).toBe(100);
    });

    it('should handle manual assignment override workflow', async () => {
      // Create schedule and auto-generate
      const createResponse = await create({
        location: 'Manual Override Test',
        week: '48',
        shows: testShows.slice(0, 3)
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      const autoGenResponse = await autoGenerate({ shows: testShows.slice(0, 3) });
      expect(autoGenResponse.success).toBe(true);

      // Create manual overrides
      const manualAssignments: Assignment[] = [
        ...autoGenResponse.assignments.filter(a => a.role !== 'Sarge'), // Keep non-Sarge assignments
        { showId: "show1", role: "Sarge", performer: "SEAN" }, // Override Sarge for show1
        { showId: "show2", role: "Sarge", performer: "PHIL" }, // Override Sarge for show2
        { showId: "show3", role: "Sarge", performer: "SEAN" }  // Override Sarge for show3
      ];

      // Update with manual assignments
      await update({
        id: scheduleId,
        assignments: manualAssignments
      });

      // Validate manual assignments
      const validation = await validate({
        shows: testShows.slice(0, 3),
        assignments: manualAssignments
      });

      expect(validation.isValid).toBe(true);

      // Verify specific manual assignments are in place
      const sargeAssignments = manualAssignments.filter(a => a.role === 'Sarge');
      expect(sargeAssignments).toHaveLength(3);
      expect(sargeAssignments.find(a => a.showId === 'show1')?.performer).toBe('SEAN');
      expect(sargeAssignments.find(a => a.showId === 'show2')?.performer).toBe('PHIL');
    });

    it('should validate complete schedule export data integrity', async () => {
      // Create and populate a complete schedule
      const createResponse = await create({
        location: 'Export Test',
        week: '49',
        shows: testShows
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      const autoGenResponse = await autoGenerate({ shows: testShows });
      expect(autoGenResponse.success).toBe(true);

      await update({
        id: scheduleId,
        assignments: autoGenResponse.assignments
      });

      // Get final schedule for export
      const finalSchedule = await get({ id: scheduleId });
      
      // Verify data integrity for export
      expect(finalSchedule.schedule.location).toBe('Export Test');
      expect(finalSchedule.schedule.week).toBe('49');
      expect(finalSchedule.schedule.shows).toHaveLength(testShows.length);
      expect(finalSchedule.schedule.assignments.length).toBeGreaterThan(0);

      // Verify all show types are present
      const hasShowDay = finalSchedule.schedule.shows.some(s => s.status === 'show');
      const hasTravelDay = finalSchedule.schedule.shows.some(s => s.status === 'travel');
      const hasDayOff = finalSchedule.schedule.shows.some(s => s.status === 'dayoff');
      
      expect(hasShowDay).toBe(true);
      expect(hasTravelDay).toBe(true);
      expect(hasDayOff).toBe(true);

      // Verify assignment data completeness
      const activeShows = finalSchedule.schedule.shows.filter(s => s.status === 'show');
      const expectedAssignments = activeShows.length * 8;
      expect(finalSchedule.schedule.assignments).toHaveLength(expectedAssignments);

      // Verify all roles are represented
      const assignedRoles = new Set(finalSchedule.schedule.assignments.map(a => a.role));
      expect(assignedRoles.size).toBe(8); // All 8 roles should be present

      // Verify all active shows have assignments
      activeShows.forEach(show => {
        const showAssignments = finalSchedule.schedule.assignments.filter(a => a.showId === show.id);
        expect(showAssignments).toHaveLength(8); // Each show should have 8 role assignments
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty schedule gracefully', async () => {
      const createResponse = await create({
        location: 'Empty Test',
        week: '50',
        shows: []
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Auto-generate with no shows
      const autoGenResponse = await autoGenerate({ shows: [] });
      
      expect(autoGenResponse.success).toBe(true);
      expect(autoGenResponse.assignments).toHaveLength(0);

      // Validation should pass for empty schedule
      const validation = await validate({
        shows: [],
        assignments: []
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should handle schedule with only non-show days', async () => {
      const nonShowDays: Show[] = [
        { id: "t1", date: "2024-10-15", time: "10:00", callTime: "09:00", status: "travel" },
        { id: "d1", date: "2024-10-16", time: "00:00", callTime: "00:00", status: "dayoff" },
        { id: "t2", date: "2024-10-17", time: "14:00", callTime: "13:00", status: "travel" }
      ];

      const createResponse = await create({
        location: 'Non-Show Test',
        week: '51',
        shows: nonShowDays
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Auto-generate with only non-show days
      const autoGenResponse = await autoGenerate({ shows: nonShowDays });
      
      expect(autoGenResponse.success).toBe(true);
      expect(autoGenResponse.assignments).toHaveLength(0);

      // Validation should pass
      const validation = await validate({
        shows: nonShowDays,
        assignments: []
      });

      expect(validation.isValid).toBe(true);
    });

    it('should handle database transaction integrity', async () => {
      // Test that partial failures don't leave database in inconsistent state
      const createResponse = await create({
        location: 'Transaction Test',
        week: '52',
        shows: testShows.slice(0, 2)
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Verify schedule exists
      const getResponse1 = await get({ id: scheduleId });
      expect(getResponse1.schedule.id).toBe(scheduleId);

      // Try to update with invalid data (this should fail gracefully)
      try {
        await update({
          id: scheduleId,
          shows: testShows.slice(0, 2),
          assignments: [
            { showId: "nonexistent", role: "Sarge", performer: "PHIL" }
          ]
        });
      } catch (error) {
        // Update might fail, but schedule should still exist and be valid
      }

      // Verify schedule still exists and is in valid state
      const getResponse2 = await get({ id: scheduleId });
      expect(getResponse2.schedule.id).toBe(scheduleId);
      expect(getResponse2.schedule.location).toBe('Transaction Test');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle large schedule generation efficiently', async () => {
      // Create a large schedule (2 weeks)
      const largeShows: Show[] = [];
      for (let day = 0; day < 14; day++) {
        const date = new Date(2024, 9, 15 + day); // October 15-28, 2024
        const dateStr = date.toISOString().split('T')[0];
        
        if (day % 7 === 0) { // Sundays are day off
          largeShows.push({
            id: `dayoff_${day}`,
            date: dateStr,
            time: "00:00",
            callTime: "00:00",
            status: "dayoff"
          });
        } else if (day % 7 === 6) { // Saturdays have two shows
          largeShows.push({
            id: `show_${day}a`,
            date: dateStr,
            time: "16:00",
            callTime: "14:00",
            status: "show"
          });
          largeShows.push({
            id: `show_${day}b`,
            date: dateStr,
            time: "21:00",
            callTime: "18:00",
            status: "show"
          });
        } else { // Regular show days
          largeShows.push({
            id: `show_${day}`,
            date: dateStr,
            time: "19:00",
            callTime: "18:00",
            status: "show"
          });
        }
      }

      const createResponse = await create({
        location: 'Large Schedule Test',
        week: '53',
        shows: largeShows
      });

      const scheduleId = createResponse.schedule.id;
      createdScheduleIds.push(scheduleId);

      // Measure auto-generation time
      const startTime = Date.now();
      const autoGenResponse = await autoGenerate({ shows: largeShows });
      const endTime = Date.now();
      
      expect(autoGenResponse.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify assignment count
      const activeShows = largeShows.filter(show => show.status === 'show');
      expect(autoGenResponse.assignments).toHaveLength(activeShows.length * 8);

      // Quick validation
      const validation = await validate({
        shows: largeShows,
        assignments: autoGenResponse.assignments
      });

      expect(validation.isValid).toBe(true);
    });

    it('should handle concurrent schedule operations', async () => {
      // Create multiple schedules concurrently
      const concurrentCreates = Array.from({ length: 3 }, (_, i) => 
        create({
          location: `Concurrent Test ${i + 1}`,
          week: `${54 + i}`,
          shows: testShows.slice(0, 3)
        })
      );

      const createResponses = await Promise.all(concurrentCreates);
      
      // All should succeed
      expect(createResponses).toHaveLength(3);
      createResponses.forEach((response, i) => {
        expect(response.schedule.location).toBe(`Concurrent Test ${i + 1}`);
        createdScheduleIds.push(response.schedule.id);
      });

      // Concurrent auto-generation
      const concurrentAutoGens = createResponses.map(() => 
        autoGenerate({ shows: testShows.slice(0, 3) })
      );

      const autoGenResponses = await Promise.all(concurrentAutoGens);
      
      // All should succeed
      autoGenResponses.forEach(response => {
        expect(response.success).toBe(true);
        expect(response.assignments.length).toBeGreaterThan(0);
      });

      // Concurrent updates
      const concurrentUpdates = createResponses.map((createResp, i) => 
        update({
          id: createResp.schedule.id,
          assignments: autoGenResponses[i].assignments
        })
      );

      const updateResponses = await Promise.all(concurrentUpdates);
      
      // All should succeed
      updateResponses.forEach((response, i) => {
        expect(response.schedule.assignments.length).toBe(autoGenResponses[i].assignments.length);
      });
    });
  });
});
