import { SQLDatabase } from "encore.dev/storage/sqldb";

export const scheduleDB = new SQLDatabase("scheduler", {
  migrations: "./migrations"
});
