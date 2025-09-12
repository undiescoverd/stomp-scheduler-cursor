import { http, HttpResponse } from 'msw';

const mockCastMembers = [
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

const mockRoles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];

export const handlers = [
  // Cast members endpoint
  http.get('/cast-members', () => {
    return HttpResponse.json({
      castMembers: mockCastMembers,
      roles: mockRoles
    });
  }),

  // Company endpoint
  http.get('/company', () => {
    return HttpResponse.json({
      currentCompany: mockCastMembers.map((member, index) => ({
        id: `member_${index}`,
        name: member.name,
        eligibleRoles: member.eligibleRoles,
        status: "active",
        dateAdded: new Date().toISOString(),
        order: index
      })),
      archive: [],
      roles: mockRoles
    });
  }),

  // Schedules list endpoint
  http.get('/schedules', () => {
    return HttpResponse.json({ schedules: [] });
  }),

  // Create schedule endpoint
  http.post('/schedules', async ({ request }) => {
    const requestData = await request.json() as any;
    const scheduleId = `schedule_${Date.now()}`;
    
    return HttpResponse.json({
      schedule: {
        id: scheduleId,
        location: requestData.location,
        week: requestData.week,
        shows: requestData.shows,
        assignments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  }),

  // Auto-generate endpoint
  http.post('/schedules/auto-generate', async ({ request }) => {
    const requestData = await request.json() as any;
    const activeShows = requestData.shows.filter((show: any) => show.status === 'show');
    
    // Generate mock assignments
    const assignments = [];
    for (const show of activeShows) {
      for (const role of mockRoles) {
        const eligibleMembers = mockCastMembers.filter(member => 
          member.eligibleRoles.includes(role)
        );
        if (eligibleMembers.length > 0) {
          const randomMember = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];
          assignments.push({
            showId: show.id,
            role: role,
            performer: randomMember.name
          });
        }
      }
    }

    return HttpResponse.json({
      success: true,
      assignments: assignments
    });
  }),

  // Validate endpoint
  http.post('/schedules/validate', () => {
    return HttpResponse.json({
      isValid: true,
      errors: [],
      warnings: []
    });
  }),

  // Comprehensive validation endpoint
  http.post('/schedules/validate-comprehensive', () => {
    return HttpResponse.json({
      isValid: true,
      overallScore: 85,
      summary: {
        totalIssues: 0,
        criticalErrors: 0,
        warnings: 0,
        completionPercentage: 100
      },
      issues: [],
      loadBalancing: [],
      consecutiveAnalysis: [],
      roleCompleteness: [],
      specialDayHandling: {
        travelDays: 0,
        dayOffs: 0,
        totalSpecialDays: 0,
        impactOnScheduling: "low"
      },
      recommendations: ["Schedule looks good! All major constraints are satisfied."]
    });
  }),

  // Get schedule endpoint
  http.get('/schedules/:id', ({ params }) => {
    return HttpResponse.json({
      schedule: {
        id: params.id,
        location: 'Test Schedule',
        week: '42',
        shows: [],
        assignments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  }),

  // Update schedule endpoint
  http.put('/schedules/:id', async ({ params, request }) => {
    const updateData = await request.json() as any;
    
    return HttpResponse.json({
      schedule: {
        id: params.id,
        location: updateData.location || 'Test Schedule',
        week: updateData.week || '42',
        shows: updateData.shows || [],
        assignments: updateData.assignments || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
  }),

  // Delete schedule endpoint
  http.delete('/schedules/:id', () => {
    return new HttpResponse(null, { status: 200 });
  }),
];
