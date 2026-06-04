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
  unit: "count" | "bytes" | "capacity-unit" | "milliseconds";
  caption?: string;
};

export type UsageModule = {
  id: string;
  label: string;
  caption: string;
  metrics: UsageMetric[];
};

export type CostRiskLevel = "free-tier" | "watch" | "billable";

export type CostEstimateItem = {
  id: string;
  label: string;
  estimateLabel: string;
  freeTierLabel: string;
  usageLabel: string;
  detail: string;
  riskLevel: CostRiskLevel;
};

export type OperationalCostEstimate = {
  headline: string;
  summaryLabel: string;
  caption: string;
  disclaimer: string;
  items: CostEstimateItem[];
};

export type OperationalUsageSnapshot = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  source: "cloudwatch";
  modules: UsageModule[];
  costEstimate: OperationalCostEstimate;
  note: string;
};
