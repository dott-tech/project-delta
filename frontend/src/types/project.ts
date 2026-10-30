export type PhaseStatus = 'NOT_STARTED' | 'COMPLETED';
export type ProjectRole = 'MANAGER' | 'EDITOR' | 'VIEWER';
export type FileReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface ProjectPhase {
  id: string;
  name: string;
  status: PhaseStatus;
  progressPercent?: number;
  projectId?: string;
  order?: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
}

export interface ProjectMember {
  id: string;
  userId?: string;
  role: ProjectRole;
  user: {
    id: string;
    name: string;
    email: string;
    role?: 'ADMIN' | 'TEAM_MEMBER' | 'CLIENT';
  };
}

export interface ProjectFile {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl?: string;
  downloadUrl?: string;
  fileSize?: number | null;
  allowedRoles?: ProjectRole[];
  reviewStatus: FileReviewStatus;
  uploadedByUserId?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  createdAt?: string;
}

export interface ProjectActivity {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  userId?: string | null;
  user?: { id: string; name: string; email: string } | null;
}

export interface ProjectNavigationNode {
  id: string;
  title: string;
  location: string;
  projectType?: string;
  buildingCode?: string | null;
  parentProjectId?: string | null;
  isArchived?: boolean;
  subProjects?: ProjectNavigationNode[];
}

export interface ProjectProgressNode {
  id: string;
  phases: ProjectPhase[];
  subProjects: ProjectProgressNode[];
}

export interface Project {
  id: string;
  title: string;
  description?: string | null;
  projectType: string;
  location: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt?: string;
  parentProjectId?: string | null;
  parentProject?: ProjectNavigationNode | null;
  buildingCode?: string | null;
  facilityType?: string | null;
  effectiveProjectRole?: ProjectRole | null;
  createdBy?: { id: string; name: string; email: string };
  updatedBy?: { id: string; name: string; email: string } | null;
  files?: ProjectFile[];
  phases?: ProjectPhase[];
  subProjects?: Project[];
  progressTree?: ProjectProgressNode;
  members?: ProjectMember[];
}
