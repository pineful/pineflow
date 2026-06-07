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
  usagePercent: number;
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

export type UsageTrendPoint = {
  label: string;
  timestamp: string;
  value: number;
};

export type UsageTrend = {
  id: string;
  label: string;
  unit: UsageMetric["unit"];
  points: UsageTrendPoint[];
};

export type OperationalUsageSnapshot = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  source: "cloudwatch";
  cacheStatus: "fresh" | "cached";
  cacheDate: string;
  modules: UsageModule[];
  trends: UsageTrend[];
  costEstimate: OperationalCostEstimate;
  note: string;
};

export type TrendLensCategoryId = "security" | "mandolin" | "it-content" | "education";

export type TrendLensPriority = "urgent" | "high" | "watch" | "note";

export type TrendLensRegion = "korea" | "global";

export type TrendLensItem = {
  id: string;
  category: TrendLensCategoryId;
  priority: TrendLensPriority;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt?: string;
  region: TrendLensRegion;
  language: "ko" | "en";
  reasonTags: string[];
};

export type TrendLensSection = {
  id: TrendLensCategoryId;
  title: string;
  subtitle: string;
  focus: string;
  items: TrendLensItem[];
};

export type TrendLensSourceStatus = {
  id: string;
  label: string;
  status: "ready" | "partial" | "unavailable" | "planned";
  checkedAt: string;
  message: string;
};

export type TrendLensSnapshot = {
  generatedAt: string;
  cacheDate: string;
  cacheStatus: "fresh" | "cached" | "stale" | "partial" | "unavailable";
  scope: "all" | "security";
  title: string;
  summary: string;
  nextScheduledRefreshAt: string;
  nextManualRefreshAllowedAt: string;
  sections: TrendLensSection[];
  briefItems: TrendLensItem[];
  sourceStatuses: TrendLensSourceStatus[];
  note: string;
};
