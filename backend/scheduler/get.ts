import { api, APIError } from "encore.dev/api";
import { scheduleDB } from "./db";
import { Schedule, Show, Assignment } from "./types";

export interface GetScheduleRequest {
  id: string;
}

export interface GetScheduleResponse {
  schedule: Schedule;
}

// Retrieves a schedule by ID.
export const get = api<GetScheduleRequest, GetScheduleResponse>(
  { expose: true, method: "GET", path: "/schedules/:id" },
  async (req) => {
    const row = await scheduleDB.queryRow`
      SELECT id, location, week, shows_data, assignments_data, created_at, updated_at
      FROM schedules 
      WHERE id = ${req.id}
    `;

    if (!row) {
      throw APIError.notFound("schedule not found");
    }

    const schedule: Schedule = {
      id: row.id,
      location: row.location,
      week: row.week,
      shows: JSON.parse(row.shows_data) as Show[],
      assignments: JSON.parse(row.assignments_data) as Assignment[],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    return { schedule };
  }
);
