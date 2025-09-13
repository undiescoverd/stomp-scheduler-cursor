import { api, APIError } from "encore.dev/api";
import { scheduleDB } from "./db";
import { Assignment } from "./types";

export interface ToggleRedDayRequest {
  id: string;
  showId: string;
  performer: string;
}

export interface ToggleRedDayResponse {
  assignments: Assignment[];
}

// Toggles the RED day status for a performer's OFF assignment.
export const toggleRedDay = api<ToggleRedDayRequest, ToggleRedDayResponse>(
  { expose: true, method: "PUT", path: "/schedules/:id/toggle-red-day" },
  async (req) => {
    // First, get the existing schedule
    const existingRow = await scheduleDB.queryRow`
      SELECT id, assignments_data, updated_at
      FROM schedules 
      WHERE id = ${req.id}
    `;

    if (!existingRow) {
      throw APIError.notFound("schedule not found");
    }

    const assignments: Assignment[] = JSON.parse(existingRow.assignments_data);
    
    // Find the OFF assignment for this performer and show
    const offAssignmentIndex = assignments.findIndex(
      a => a.showId === req.showId && 
           a.performer === req.performer && 
           a.role === "OFF"
    );

    if (offAssignmentIndex === -1) {
      throw APIError.notFound("OFF assignment not found for this performer and show");
    }

    // Toggle the RED day status
    assignments[offAssignmentIndex].isRedDay = !assignments[offAssignmentIndex].isRedDay;

    // Update the database
    const now = new Date();
    await scheduleDB.exec`
      UPDATE schedules 
      SET assignments_data = ${JSON.stringify(assignments)}, 
          updated_at = ${now}
      WHERE id = ${req.id}
    `;

    return { assignments };
  }
);
