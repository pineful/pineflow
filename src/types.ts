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

export type UsageMetric = {
  id: string;
  label: string;
  value: number;
  unit: "count" | "bytes" | "capacity-unit";
  caption?: string;
};

export type UsageModule = {
  id: string;
  label: string;
  caption: string;
  metrics: UsageMetric[];
};

export type OperationalUsageSnapshot = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  source: "cloudwatch";
  modules: UsageModule[];
  note: string;
};
