import { api, APIError } from "encore.dev/api";
import { scheduleDB } from "./db";
import { Schedule, Show, Assignment } from "./types";

export interface UpdateScheduleRequest {
  id: string;
  location?: string;
  week?: string;
  shows?: Show[];
  assignments?: Assignment[];
}

export interface UpdateScheduleResponse {
  schedule: Schedule;
}

// Updates a schedule.
export const update = api<UpdateScheduleRequest, UpdateScheduleResponse>(
  { expose: true, method: "PUT", path: "/schedules/:id" },
  async (req) => {
    // First, get the existing schedule
    const existingRow = await scheduleDB.queryRow`
      SELECT id, location, week, shows_data, assignments_data, created_at, updated_at
      FROM schedules 
      WHERE id = ${req.id}
    `;

    if (!existingRow) {
      throw APIError.notFound("schedule not found");
    }

    const now = new Date();
    const location = req.location ?? existingRow.location;
    const week = req.week ?? existingRow.week;
    const shows = req.shows ?? JSON.parse(existingRow.shows_data);
    const assignments = req.assignments ?? JSON.parse(existingRow.assignments_data);

    await scheduleDB.exec`
      UPDATE schedules 
      SET location = ${location}, 
          week = ${week}, 
          shows_data = ${JSON.stringify(shows)}, 
          assignments_data = ${JSON.stringify(assignments)}, 
          updated_at = ${now}
      WHERE id = ${req.id}
    `;

    const schedule: Schedule = {
      id: req.id,
      location,
      week,
      shows,
      assignments,
      createdAt: new Date(existingRow.created_at),
      updatedAt: now
    };

    return { schedule };
  }
);
