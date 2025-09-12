import { api } from "encore.dev/api";
import { CAST_MEMBERS, ROLES, CastMember, Role } from "./types";

export interface CompanyMember {
  id: string;
  name: string;
  eligibleRoles: Role[];
  status: "active" | "archived";
  archiveCategory?: "on_tour" | "substitute" | "alumni";
  dateAdded: Date;
  dateArchived?: Date;
  archiveReason?: string;
  order: number;
}

export interface GetCompanyResponse {
  currentCompany: CompanyMember[];
  archive: CompanyMember[];
  roles: Role[];
}

export interface AddMemberRequest {
  name: string;
  eligibleRoles: Role[];
  status?: "active" | "archived";
  archiveCategory?: "on_tour" | "substitute" | "alumni";
  archiveReason?: string;
}

export interface AddMemberResponse {
  member: CompanyMember;
}

export interface UpdateMemberRequest {
  id: string;
  name?: string;
  eligibleRoles?: Role[];
  status?: "active" | "archived";
  archiveCategory?: "on_tour" | "substitute" | "alumni";
  archiveReason?: string;
  order?: number;
}

export interface UpdateMemberResponse {
  member: CompanyMember;
}

export interface DeleteMemberRequest {
  id: string;
}

export interface ReorderMembersRequest {
  memberIds: string[];
}

// In-memory storage for company data (in a real app, this would be in a database)
let companyMembers: CompanyMember[] = [];

// Initialize with default cast members
const initializeDefaultCompany = () => {
  if (companyMembers.length === 0) {
    companyMembers = CAST_MEMBERS.map((member, index) => ({
      id: `member_${Date.now()}_${index}`,
      name: member.name,
      eligibleRoles: member.eligibleRoles,
      status: "active" as const,
      dateAdded: new Date(),
      order: index
    }));
  }
};

// Retrieves the current company and archive.
export const getCompany = api<void, GetCompanyResponse>(
  { expose: true, method: "GET", path: "/company" },
  async () => {
    initializeDefaultCompany();
    
    const currentCompany = companyMembers
      .filter(member => member.status === "active")
      .sort((a, b) => a.order - b.order);
    
    const archive = companyMembers
      .filter(member => member.status === "archived")
      .sort((a, b) => (b.dateArchived?.getTime() || 0) - (a.dateArchived?.getTime() || 0));
    
    return {
      currentCompany,
      archive,
      roles: ROLES
    };
  }
);

// Adds a new cast member to the company.
export const addMember = api<AddMemberRequest, AddMemberResponse>(
  { expose: true, method: "POST", path: "/company/members" },
  async (req) => {
    initializeDefaultCompany();
    
    const id = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    // Get the highest order number for active members
    const activeMembers = companyMembers.filter(m => m.status === "active");
    const maxOrder = Math.max(...activeMembers.map(m => m.order), -1);
    
    const member: CompanyMember = {
      id,
      name: req.name.toUpperCase(),
      eligibleRoles: req.eligibleRoles,
      status: req.status || "active",
      archiveCategory: req.archiveCategory,
      dateAdded: now,
      dateArchived: req.status === "archived" ? now : undefined,
      archiveReason: req.archiveReason,
      order: req.status === "active" ? maxOrder + 1 : 0
    };
    
    companyMembers.push(member);
    
    return { member };
  }
);

// Updates an existing cast member.
export const updateMember = api<UpdateMemberRequest, UpdateMemberResponse>(
  { expose: true, method: "PUT", path: "/company/members/:id" },
  async (req) => {
    initializeDefaultCompany();
    
    const memberIndex = companyMembers.findIndex(m => m.id === req.id);
    if (memberIndex === -1) {
      throw new Error("Member not found");
    }
    
    const member = companyMembers[memberIndex];
    const now = new Date();
    
    // Update fields
    if (req.name !== undefined) member.name = req.name.toUpperCase();
    if (req.eligibleRoles !== undefined) member.eligibleRoles = req.eligibleRoles;
    if (req.order !== undefined) member.order = req.order;
    
    // Handle status changes
    if (req.status !== undefined && req.status !== member.status) {
      member.status = req.status;
      
      if (req.status === "archived") {
        member.dateArchived = now;
        member.archiveCategory = req.archiveCategory;
        member.archiveReason = req.archiveReason;
        member.order = 0; // Reset order for archived members
      } else if (req.status === "active") {
        // Moving back to active
        member.dateArchived = undefined;
        member.archiveCategory = undefined;
        member.archiveReason = undefined;
        
        // Assign new order at the end of active members
        const activeMembers = companyMembers.filter(m => m.status === "active" && m.id !== req.id);
        const maxOrder = Math.max(...activeMembers.map(m => m.order), -1);
        member.order = maxOrder + 1;
      }
    } else if (member.status === "archived") {
      // Update archive-specific fields
      if (req.archiveCategory !== undefined) member.archiveCategory = req.archiveCategory;
      if (req.archiveReason !== undefined) member.archiveReason = req.archiveReason;
    }
    
    companyMembers[memberIndex] = member;
    
    return { member };
  }
);

// Deletes a cast member permanently.
export const deleteMember = api<DeleteMemberRequest, void>(
  { expose: true, method: "DELETE", path: "/company/members/:id" },
  async (req) => {
    initializeDefaultCompany();
    
    const memberIndex = companyMembers.findIndex(m => m.id === req.id);
    if (memberIndex === -1) {
      throw new Error("Member not found");
    }
    
    companyMembers.splice(memberIndex, 1);
  }
);

// Reorders the current company members.
export const reorderMembers = api<ReorderMembersRequest, void>(
  { expose: true, method: "PUT", path: "/company/reorder" },
  async (req) => {
    initializeDefaultCompany();
    
    // Update order based on the provided array
    req.memberIds.forEach((id, index) => {
      const member = companyMembers.find(m => m.id === id);
      if (member && member.status === "active") {
        member.order = index;
      }
    });
  }
);
