import { api, APIError } from "encore.dev/api";
import { scheduleDB } from "./db";

export interface DeleteScheduleRequest {
  id: string;
}

// Deletes a schedule.
export const deleteSchedule = api<DeleteScheduleRequest, void>(
  { expose: true, method: "DELETE", path: "/schedules/:id" },
  async (req) => {
    const result = await scheduleDB.queryRow`
      SELECT id FROM schedules WHERE id = ${req.id}
    `;

    if (!result) {
      throw APIError.notFound("schedule not found");
    }

    await scheduleDB.exec`
      DELETE FROM schedules WHERE id = ${req.id}
    `;
  }
);
