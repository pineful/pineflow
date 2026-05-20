export type WorkMode = "focus" | "remote" | "study" | "project";

export type CommuteRecord = {
  id: string;
  type: "check-in" | "check-out";
  timestamp: string;
  mode: WorkMode;
  note: string;
};

export type ActiveSession = {
  id?: string;
  checkInAt: string;
  mode: WorkMode;
  note: string;
};

export type CommuteState = {
  records: CommuteRecord[];
  activeSession: ActiveSession | null;
  dailyGoalMinutes: number;
};
