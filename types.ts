export enum Gender {
  MALE = '男',
  FEMALE = '女',
}

export interface Staff {
  id: string;
  name: string;
  gender: Gender;
  preferredPartnerId?: string; // ID of preferred partner
  active: boolean; // For soft delete
}

export enum ShiftType {
  OPENING = 'OPENING',
  CLOSING = 'CLOSING',
}

export interface JobDefinition {
  id: string;
  name: string;
  requiredCount: number; // Suggested number of people
  isVariable: boolean; // If true, count can fluctuate based on attendance
  description?: string;
  difficultyLevel: number; // 1 (Hardest) to 5 (Lightest)
  genderConstraint?: Gender; // If set, this gender CANNOT do this job (e.g. FEMALE cannot do Opening Wash)
}

// The daily record stores the rotation order of staff for that day.
// Jobs are assigned by mapping the rotation order to the job list.
export interface DailyRecord {
  date: string; // YYYY-MM-DD
  attendanceIds: string[]; // IDs of staff present
  rotationOrder: string[]; // IDs of staff in order of priority (Rank 1 = Hardest job)
  
  // Finalized assignments (Manual overrides are saved here)
  openingAssignments: Record<string, string[]>; // JobID -> StaffIDs[]
  closingAssignments: Record<string, string[]>; // JobID -> StaffIDs[]
  
  notes?: string;
}

export interface AppState {
  staff: Staff[];
  history: DailyRecord[];
}