import { api } from "encore.dev/api";
import { CAST_MEMBERS, ROLES, CastMember, Role } from "./types";

export interface GetCastMembersResponse {
  castMembers: CastMember[];
  roles: Role[];
}

// Retrieves all cast members and their role eligibility.
export const getCastMembers = api<void, GetCastMembersResponse>(
  { expose: true, method: "GET", path: "/cast-members" },
  async () => {
    return {
      castMembers: CAST_MEMBERS,
      roles: ROLES
    };
  }
);
