import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";

const tableName = process.env.TABLE_NAME;

if (!tableName) {
  throw new Error("TABLE_NAME is required.");
}

const dynamodb = new DynamoDBClient({});
let cloudwatchSdkPromise;
const allowedModes = new Set(["focus", "remote", "study", "project"]);
const defaultDailyGoalMinutes = 480;
const stateRecentSessionLimit = 12;
const maxBodyBytes = 4096;
const frontendBucketName = process.env.FRONTEND_BUCKET_NAME ?? "";
const cloudFrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID ?? "";
const apiId = process.env.API_ID ?? "";
const apiStage = process.env.API_STAGE ?? "$default";
const apiFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME ?? "pineflow-api";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (event.isBase64Encoded) {
    return { ok: false, error: "Base64 encoded body is not supported." };
  }

  if (!event.body) return { ok: true, value: {} };
  if (Buffer.byteLength(event.body, "utf8") > maxBodyBytes) {
    return { ok: false, error: "Request body is too large." };
  }

  try {
    const value = JSON.parse(event.body);
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      return { ok: false, error: "Request body must be a JSON object." };
    }

    return { ok: true, value };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

function getUserPartitionKey(event) {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!sub) return null;

  return `USER#${sub}`;
}

function itemToObject(item) {
  if (!item) return undefined;

  return Object.fromEntries(
    Object.entries(item).map(([key, value]) => {
      if ("S" in value) return [key, value.S];
      if ("N" in value) return [key, Number(value.N)];
      return [key, undefined];
    })
  );
}

function objectToItem(item) {
  return Object.fromEntries(
    Object.entries(item)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        if (typeof value === "number") return [key, { N: String(value) }];
        return [key, { S: String(value) }];
      })
  );
}

function updateExpressionFor(attributes) {
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null);

  return {
    UpdateExpression: `set ${entries.map(([key]) => `#${key} = :${key}`).join(", ")}`,
    ExpressionAttributeNames: Object.fromEntries(entries.map(([key]) => [`#${key}`, key])),
    ExpressionAttributeValues: objectToItem(
      Object.fromEntries(entries.map(([key, value]) => [`:${key}`, value]))
    )
  };
}

function isConditionalFailure(error) {
  return error?.name === "ConditionalCheckFailedException" || error?.name === "TransactionCanceledException";
}

function isThroughputLimited(error) {
  return [
    "ProvisionedThroughputExceededException",
    "RequestLimitExceeded",
    "ThrottlingException",
    "TooManyRequestsException"
  ].includes(error?.name);
}

function toRecords(session, activeSessionId) {
  const sessionStatus = session.checkOutAt
    ? "completed"
    : session.sessionId === activeSessionId
      ? "active"
      : "missing-check-out";
  const checkIn = {
    id: `${session.sessionId}:in`,
    type: "check-in",
    timestamp: session.checkInAt,
    mode: session.mode,
    note: session.note,
    sessionStatus
  };

  if (!session.checkOutAt) return [checkIn];

  return [
    {
      id: `${session.sessionId}:out`,
      type: "check-out",
      timestamp: session.checkOutAt,
      mode: session.mode,
      note: session.note,
      sessionStatus
    },
    checkIn
  ];
}

function sortRecordsByTimestampDesc(records) {
  return records.sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();

    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    if (left.type === right.type) return 0;

    return left.type === "check-out" ? -1 : 1;
  });
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
}

function cacheDateFor(date) {
  const koreaTime = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return koreaTime.toISOString().slice(0, 10);
}

function usageCacheKey(date) {
  return `USAGE#${cacheDateFor(date)}`;
}

function sumMetric(results, id) {
  const result = results.find((item) => item.Id === id);
  return Math.round((result?.Values ?? []).reduce((sum, value) => sum + Number(value || 0), 0));
}

function latestMetric(results, id) {
  const result = results.find((item) => item.Id === id);
  const values = result?.Values ?? [];
  const latest = values.findLast((value) => Number.isFinite(Number(value)));
  return Math.round(Number(latest ?? 0));
}

function formatCount(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}건`;
}

function formatBytes(value) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)}GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${Math.round(value).toLocaleString("ko-KR")}B`;
}

function riskLevelFor(value, freeLimit) {
  if (freeLimit <= 0) return "free-tier";
  if (value > freeLimit) return "billable";
  if (value > freeLimit * 0.8) return "watch";
  return "free-tier";
}

function riskLabel(riskLevel) {
  if (riskLevel === "billable") return "초과 가능";
  if (riskLevel === "watch") return "주의";
  return "무료 범위 예상";
}

function costEstimateItem({ id, label, value, freeLimit, freeTierLabel, usageLabel, detail }) {
  const riskLevel = riskLevelFor(value, freeLimit);
  const usagePercent = freeLimit > 0 ? Math.min(100, Math.round((value / freeLimit) * 100)) : 0;
  return {
    id,
    label,
    estimateLabel: riskLabel(riskLevel),
    freeTierLabel,
    usageLabel,
    usagePercent,
    detail,
    riskLevel
  };
}

function buildCostEstimate({
  apiRequests,
  lambdaInvocations,
  lambdaDurationMs,
  dynamodbRead,
  dynamodbWrite,
  cloudfrontRequests,
  cloudfrontBytes,
  s3Bytes
}) {
  const lambdaGbSeconds = (lambdaDurationMs / 1000) * 0.125;
  const cloudfrontFreeBytes = 100 * 1024 * 1024 * 1024;
  const s3FreeBytes = 5 * 1024 * 1024 * 1024;
  const items = [
    costEstimateItem({
      id: "api",
      label: "API Gateway",
      value: apiRequests,
      freeLimit: 1_000_000,
      freeTierLabel: "HTTP API 100만 요청/월",
      usageLabel: formatCount(apiRequests),
      detail: "Free Tier가 끝난 계정도 개인 사용량이면 표준 요금 기준 영향은 보통 센트 단위입니다."
    }),
    costEstimateItem({
      id: "lambda",
      label: "Lambda",
      value: Math.max(lambdaInvocations / 1_000_000, lambdaGbSeconds / 400_000),
      freeLimit: 1,
      freeTierLabel: "100만 요청 + 400,000 GB-s/월",
      usageLabel: `${formatCount(lambdaInvocations)} · ${lambdaGbSeconds.toFixed(3)} GB-s`,
      detail: "128MB, reserved concurrency 1 구성이라 개인 사용에서는 컴퓨팅 비용 발생 가능성이 낮습니다."
    }),
    {
      id: "dynamodb",
      label: "DynamoDB",
      estimateLabel: "무료 범위 예상",
      freeTierLabel: "25 RCU + 25 WCU + 25GB",
      usageLabel: `읽기 ${Math.round(dynamodbRead).toLocaleString("ko-KR")} · 쓰기 ${Math.round(dynamodbWrite).toLocaleString("ko-KR")}`,
      usagePercent: 0,
      detail: "현재 테이블은 provisioned 1 RCU / 1 WCU로 고정되어 무료 제공량보다 낮습니다.",
      riskLevel: "free-tier"
    },
    costEstimateItem({
      id: "cloudfront",
      label: "CloudFront",
      value: Math.max(cloudfrontRequests / 1_000_000, cloudfrontBytes / cloudfrontFreeBytes),
      freeLimit: 1,
      freeTierLabel: "Free plan 기준 100GB 전송 + 100만 요청/월",
      usageLabel: `${formatCount(cloudfrontRequests)} · ${formatBytes(cloudfrontBytes)}`,
      detail: "앱 URL이 외부에 노출되어 정적 파일 요청이 급증하면 가장 먼저 확인해야 하는 항목입니다."
    }),
    costEstimateItem({
      id: "s3",
      label: "S3",
      value: s3Bytes,
      freeLimit: s3FreeBytes,
      freeTierLabel: "5GB Standard storage",
      usageLabel: formatBytes(s3Bytes),
      detail: "정적 프론트엔드 assets/ 객체는 30일 후 Intelligent-Tiering으로 전환해 장기 저장 비용을 낮춥니다."
    }),
    {
      id: "cognito",
      label: "Cognito",
      estimateLabel: "무료 범위 예상",
      freeTierLabel: "직접 로그인 10,000 MAU/월",
      usageLabel: "관리자 생성 개인 계정",
      usagePercent: 0,
      detail: "self sign-up을 막아 두었기 때문에 원치 않는 MAU 증가 가능성을 낮췄습니다.",
      riskLevel: "free-tier"
    },
    {
      id: "cloudwatch",
      label: "CloudWatch Logs",
      estimateLabel: "무료 범위 예상",
      freeTierLabel: "Logs 5GB 무료 범위",
      usageLabel: "7일 보관",
      usagePercent: 0,
      detail: "Lambda 로그 보관 기간을 7일로 제한해 로그 저장 비용이 누적되지 않게 했습니다.",
      riskLevel: "free-tier"
    },
    {
      id: "budgets",
      label: "AWS Budgets",
      estimateLabel: "무료 범위 예상",
      freeTierLabel: "단순 예산 알림 무료",
      usageLabel: "$1 · $3 · $5 알림",
      usagePercent: 0,
      detail: "Budget action이나 report를 추가하지 않는 한 현재 알림 구성은 비용을 만들지 않습니다.",
      riskLevel: "free-tier"
    }
  ];

  const hasBillable = items.some((item) => item.riskLevel === "billable");
  const hasWatch = items.some((item) => item.riskLevel === "watch");

  return {
    headline: hasBillable ? "초과 가능 항목 있음" : hasWatch ? "무료 범위 근접 항목 있음" : "$0 예상",
    summaryLabel: hasBillable ? "즉시 확인 필요" : hasWatch ? "주의 관찰" : "Free Tier 안쪽으로 보임",
    caption: "CloudWatch 사용량과 Pineflow 설정을 Free Tier 기준선에 대입한 추정입니다.",
    disclaimer: "실제 청구액은 AWS Billing과 Budget 알림이 최종 기준입니다. Cost Explorer API는 호출당 비용이 있어 이 화면에서는 사용하지 않습니다.",
    items
  };
}

function metricQuery(id, namespace, metricName, dimensions, stat = "Sum") {
  return {
    Id: id,
    MetricStat: {
      Metric: {
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensions
      },
      Period: 86400,
      Stat: stat
    },
    ReturnData: true
  };
}

function trendPoints(results, id) {
  const result = results.find((item) => item.Id === id);
  const timestamps = result?.Timestamps ?? [];
  const values = result?.Values ?? [];

  return timestamps
    .map((timestamp, index) => {
      const date = new Date(timestamp);
      return {
        timestamp: date.toISOString(),
        label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
        value: Math.round(Number(values[index] ?? 0))
      };
    })
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
    .slice(-14);
}

function buildUsageTrends(localMetrics, globalMetrics) {
  return [
    {
      id: "apiRequests",
      label: "API 요청",
      unit: "count",
      points: trendPoints(localMetrics, "apiRequests")
    },
    {
      id: "lambdaErrors",
      label: "Lambda 오류",
      unit: "count",
      points: trendPoints(localMetrics, "lambdaErrors")
    },
    {
      id: "cloudfrontBytes",
      label: "전송량",
      unit: "bytes",
      points: trendPoints(globalMetrics, "cloudfrontBytes")
    },
    {
      id: "s3Bytes",
      label: "S3 저장량",
      unit: "bytes",
      points: trendPoints(localMetrics, "s3Bytes")
    }
  ].filter((trend) => trend.points.length > 0);
}

async function readMetrics(options, metricDataQueries, startTime, endTime) {
  if (metricDataQueries.length === 0) return [];

  if (!cloudwatchSdkPromise) {
    cloudwatchSdkPromise = import("@aws-sdk/client-cloudwatch");
  }

  const { CloudWatchClient, GetMetricDataCommand } = await cloudwatchSdkPromise;
  const cloudwatch = new CloudWatchClient(options.region ? { region: options.region } : {});
  const result = await cloudwatch.send(
    new GetMetricDataCommand({
      StartTime: startTime,
      EndTime: endTime,
      MetricDataQueries: metricDataQueries
    })
  );

  return result.MetricDataResults ?? [];
}

async function safeReadMetrics(client, metricDataQueries, startTime, endTime, scope) {
  try {
    return await readMetrics(client, metricDataQueries, startTime, endTime);
  } catch (error) {
    console.warn("CloudWatch usage metrics unavailable", { scope, name: error?.name });
    return [];
  }
}

async function loadCachedUsageSnapshot(pk, now) {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: usageCacheKey(now) })
    })
  );
  const cached = itemToObject(result.Item);
  if (!cached?.payload) return null;

  try {
    const snapshot = JSON.parse(cached.payload);
    if (snapshot?.cacheDate !== cacheDateFor(now)) return null;
    return {
      ...snapshot,
      cacheStatus: "cached"
    };
  } catch {
    return null;
  }
}

async function saveUsageSnapshot(pk, snapshot) {
  await dynamodb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: objectToItem({
        pk,
        sk: `USAGE#${snapshot.cacheDate}`,
        entityType: "USAGE_CACHE",
        cacheDate: snapshot.cacheDate,
        generatedAt: snapshot.generatedAt,
        payload: JSON.stringify(snapshot)
      })
    })
  );
}

async function loadUsageSnapshot(pk) {
  const now = new Date();
  let cached = null;
  try {
    cached = await loadCachedUsageSnapshot(pk, now);
  } catch (error) {
    console.warn("Usage snapshot cache read failed", { name: error?.name });
  }

  if (cached) return cached;

  const periodStart = startOfMonth(now);
  const localMetricQueries = [
    metricQuery("lambdaInvocations", "AWS/Lambda", "Invocations", [
      { Name: "FunctionName", Value: apiFunctionName }
    ]),
    metricQuery("lambdaErrors", "AWS/Lambda", "Errors", [
      { Name: "FunctionName", Value: apiFunctionName }
    ]),
    metricQuery("lambdaDurationMs", "AWS/Lambda", "Duration", [
      { Name: "FunctionName", Value: apiFunctionName }
    ]),
    metricQuery("dynamodbRead", "AWS/DynamoDB", "ConsumedReadCapacityUnits", [
      { Name: "TableName", Value: tableName }
    ]),
    metricQuery("dynamodbWrite", "AWS/DynamoDB", "ConsumedWriteCapacityUnits", [
      { Name: "TableName", Value: tableName }
    ])
  ];

  if (apiId) {
    localMetricQueries.push(
      metricQuery("apiRequests", "AWS/ApiGateway", "Count", [
        { Name: "ApiId", Value: apiId },
        { Name: "Stage", Value: apiStage }
      ])
    );
  }

  if (frontendBucketName) {
    localMetricQueries.push(
      metricQuery(
        "s3Bytes",
        "AWS/S3",
        "BucketSizeBytes",
        [
          { Name: "BucketName", Value: frontendBucketName },
          { Name: "StorageType", Value: "StandardStorage" }
        ],
        "Average"
      ),
      metricQuery(
        "s3Objects",
        "AWS/S3",
        "NumberOfObjects",
        [
          { Name: "BucketName", Value: frontendBucketName },
          { Name: "StorageType", Value: "AllStorageTypes" }
        ],
        "Average"
      )
    );
  }

  const globalMetricQueries = cloudFrontDistributionId
    ? [
        metricQuery("cloudfrontRequests", "AWS/CloudFront", "Requests", [
          { Name: "DistributionId", Value: cloudFrontDistributionId },
          { Name: "Region", Value: "Global" }
        ]),
        metricQuery("cloudfrontBytes", "AWS/CloudFront", "BytesDownloaded", [
          { Name: "DistributionId", Value: cloudFrontDistributionId },
          { Name: "Region", Value: "Global" }
        ])
      ]
    : [];

  const [localMetrics, globalMetrics] = await Promise.all([
    safeReadMetrics({}, localMetricQueries, periodStart, now, "regional"),
    safeReadMetrics({ region: "us-east-1" }, globalMetricQueries, periodStart, now, "global")
  ]);
  const apiRequests = sumMetric(localMetrics, "apiRequests");
  const lambdaInvocations = sumMetric(localMetrics, "lambdaInvocations");
  const lambdaErrors = sumMetric(localMetrics, "lambdaErrors");
  const lambdaDurationMs = sumMetric(localMetrics, "lambdaDurationMs");
  const dynamodbRead = sumMetric(localMetrics, "dynamodbRead");
  const dynamodbWrite = sumMetric(localMetrics, "dynamodbWrite");
  const cloudfrontRequests = sumMetric(globalMetrics, "cloudfrontRequests");
  const cloudfrontBytes = sumMetric(globalMetrics, "cloudfrontBytes");
  const s3Bytes = latestMetric(localMetrics, "s3Bytes");
  const s3Objects = latestMetric(localMetrics, "s3Objects");

  const snapshot = {
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    source: "cloudwatch",
    cacheStatus: "fresh",
    cacheDate: cacheDateFor(now),
    note: "실제 청구액은 AWS Budgets 알림과 Billing 콘솔에서 최종 확인합니다. 이 화면은 비용을 유발하는 기초 사용량과 Free Tier 기준 추정만 보여줍니다.",
    costEstimate: buildCostEstimate({
      apiRequests,
      lambdaInvocations,
      lambdaDurationMs,
      dynamodbRead,
      dynamodbWrite,
      cloudfrontRequests,
      cloudfrontBytes,
      s3Bytes
    }),
    trends: buildUsageTrends(localMetrics, globalMetrics),
    modules: [
      {
        id: "api",
        label: "API Gateway",
        caption: "인증된 앱 요청 입구",
        metrics: [
          {
            id: "requests",
            label: "요청",
            value: apiRequests,
            unit: "count",
            caption: "이번 달 Count"
          }
        ]
      },
      {
        id: "lambda",
        label: "Lambda",
        caption: "출퇴근 API 실행",
        metrics: [
          {
            id: "invocations",
            label: "호출",
            value: lambdaInvocations,
            unit: "count"
          },
          {
            id: "errors",
            label: "오류",
            value: lambdaErrors,
            unit: "count"
          },
          {
            id: "duration",
            label: "실행시간",
            value: lambdaDurationMs,
            unit: "milliseconds"
          }
        ]
      },
      {
        id: "dynamodb",
        label: "DynamoDB",
        caption: "기록 저장소 소비량",
        metrics: [
          {
            id: "read",
            label: "읽기",
            value: dynamodbRead,
            unit: "capacity-unit"
          },
          {
            id: "write",
            label: "쓰기",
            value: dynamodbWrite,
            unit: "capacity-unit"
          }
        ]
      },
      {
        id: "cloudfront",
        label: "CloudFront",
        caption: "정적 앱 전송",
        metrics: [
          {
            id: "requests",
            label: "요청",
            value: cloudfrontRequests,
            unit: "count"
          },
          {
            id: "bytes",
            label: "전송량",
            value: cloudfrontBytes,
            unit: "bytes"
          }
        ]
      },
      {
        id: "s3",
        label: "S3",
        caption: "프론트엔드 파일 보관",
        metrics: [
          {
            id: "bytes",
            label: "저장량",
            value: s3Bytes,
            unit: "bytes",
            caption: "일 단위 지표"
          },
          {
            id: "objects",
            label: "객체",
            value: s3Objects,
            unit: "count"
          }
        ]
      }
    ]
  };

  try {
    await saveUsageSnapshot(pk, snapshot);
  } catch (error) {
    console.warn("Usage snapshot cache write failed", { name: error?.name });
  }

  return snapshot;
}

const trendLensPk = "SYSTEM#TREND_LENS";
const trendLensLatestSk = "TREND_LENS#LATEST";
const trendLensManualPrefix = "TREND_LENS#MANUAL#";
const trendLensResetPrefix = "TREND_LENS#RESET#";
const trendLensDefaultResponseLimitBytes = 512 * 1024;
const trendLensSourceTimeoutMs = 2200;
const trendLensLargeSourceTimeoutMs = 4500;
const googleNewsDecodePageLimitBytes = 1536 * 1024;
const googleNewsDecodeResponseLimitBytes = 64 * 1024;
const googleNewsDecodeTimeoutMs = 1800;
const trendLensNewsItemsPerFeed = 3;
const trendLensSnapshotTtlDays = 30;
const trendLensTextLimits = {
  title: 180,
  summary: 420,
  statusMessage: 180,
  note: 320,
  reasonTag: 32
};
const trendLensManualCooldownMs = {
  all: 30 * 60 * 1000,
  security: 5 * 60 * 1000,
  academic: 10 * 60 * 1000
};
const trendLensForcedCooldownMs = {
  all: 5 * 60 * 1000,
  security: 60 * 1000,
  academic: 60 * 1000
};
const trendLensResetCooldownMs = 60 * 1000;

const trendLensSections = [
  {
    id: "security",
    title: "긴급 보안 신호",
    subtitle: "공식 경보와 전문 보안 매체의 빠른 신호를 함께 봅니다.",
    focus: "KISA/CISA는 확인된 위험, 보안 전문 매체는 더 빠른 현장 신호로 구분합니다."
  },
  {
    id: "mandolin",
    title: "만돌린 노트",
    subtitle: "클래식 만돌린, 연주자, 레슨에 도움이 되는 흐름입니다.",
    focus: "유명 아티스트와 역사/기술 학습 소재를 중심으로 봅니다."
  },
  {
    id: "it-content",
    title: "IT 콘텐츠 레이더",
    subtitle: "콘텐츠 제작으로 이어질 수 있는 기술 관심 흐름입니다.",
    focus: "한국에 영향을 줄 만한 글로벌 기술 신호를 보조로 봅니다."
  },
  {
    id: "education",
    title: "교육 트렌드",
    subtitle: "교육 방법, 에듀테크, 학습 콘텐츠 흐름입니다.",
    focus: "콘텐츠 제작과 학습 설계에 연결될 신호를 봅니다."
  },
  {
    id: "academic-jobs",
    title: "겸임교수 공고",
    subtitle: "외대 글로벌캠퍼스, 하이브레인넷 신규 공고, 서울·경기·충북 대학 공고를 확인합니다.",
    focus: "한국외대 공식 채용 게시판과 하이브레인넷 신규 공고를 우선 확인하고, 지역 대학 공고는 고정 검색 RSS로 보조합니다."
  }
];

const trendLensSources = {
  cisaKev: {
    id: "cisa-kev",
    label: "CISA KEV",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    host: "www.cisa.gov",
    pathPrefix: "/sites/default/files/feeds/",
    accept: "application/json",
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: trendLensLargeSourceTimeoutMs
  },
  kisaSecurityNotice: {
    id: "kisa-security-notice",
    label: "KISA 보안공지",
    url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133",
    host: "www.boho.or.kr",
    pathPrefix: "/kr/rss.do",
    accept: "application/rss+xml, application/xml, text/xml"
  },
  kisaVulnerability: {
    id: "kisa-vulnerability",
    label: "KISA 취약점 정보",
    url: "https://www.boho.or.kr/kr/rss.do?bbsId=B0000302",
    host: "www.boho.or.kr",
    pathPrefix: "/kr/rss.do",
    accept: "application/rss+xml, application/xml, text/xml"
  },
  googleNews: {
    id: "google-news-rss",
    label: "Google News RSS",
    host: "news.google.com",
    pathPrefix: "/rss/",
    accept: "application/rss+xml, application/xml, text/xml"
  },
  hufsRecruitment: {
    id: "hufs-recruitment",
    label: "한국외대 채용",
    url: "https://www.hufs.ac.kr/hufs/11284/subview.do",
    host: "www.hufs.ac.kr",
    pathPrefix: "/hufs/11284/subview.do",
    accept: "text/html, application/xhtml+xml, */*"
  },
  hibrainRecruitment: {
    id: "hibrain-recruitment",
    label: "하이브레인넷 채용",
    url: "https://www.hibrain.net/recruitment/recruits?listType=D3NEW",
    host: "www.hibrain.net",
    pathPrefix: "/recruitment/recruits",
    accept: "text/html, application/xhtml+xml, */*"
  },
  theHackerNews: {
    id: "the-hacker-news",
    label: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
    host: "feeds.feedburner.com",
    pathPrefix: "/TheHackersNews",
    accept: "application/rss+xml, application/xml, text/xml",
    region: "global",
    language: "en",
    maxAgeDays: 7
  },
  bleepingComputer: {
    id: "bleeping-computer",
    label: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    host: "www.bleepingcomputer.com",
    pathPrefix: "/feed/",
    accept: "application/rss+xml, application/xml, text/xml",
    region: "global",
    language: "en",
    maxAgeDays: 7
  },
  securityWeek: {
    id: "security-week",
    label: "SecurityWeek",
    url: "https://www.securityweek.com/feed/",
    host: "www.securityweek.com",
    pathPrefix: "/feed/",
    accept: "application/rss+xml, application/xml, text/xml",
    region: "global",
    language: "en",
    maxAgeDays: 7
  },
  helpNetSecurity: {
    id: "help-net-security",
    label: "Help Net Security",
    url: "https://www.helpnetsecurity.com/feed/",
    host: "www.helpnetsecurity.com",
    pathPrefix: "/feed/",
    accept: "application/rss+xml, application/xml, text/xml",
    region: "global",
    language: "en",
    maxAgeDays: 7
  },
  googleTrendsPlanned: {
    id: "google-trends",
    label: "Google Trends"
  }
};

const securityNewsSources = [
  trendLensSources.theHackerNews,
  trendLensSources.bleepingComputer,
  trendLensSources.securityWeek,
  trendLensSources.helpNetSecurity
];

const topicNewsFeeds = {
  mandolin: [
    {
      id: "mandolin-korea",
      label: "만돌린 한국 뉴스",
      query: '만돌린 OR mandolin OR mandolinist OR "Avi Avital" OR "classical mandolin"',
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      region: "korea",
      language: "ko",
      maxAgeDays: 60
    },
    {
      id: "mandolin-global",
      label: "Mandolin global news",
      query: 'mandolin OR mandolinist OR "classical mandolin" OR "Avi Avital" OR "mandolin festival" OR "mandolin masterclass"',
      hl: "en-US",
      gl: "US",
      ceid: "US:en",
      region: "global",
      language: "en",
      maxAgeDays: 60
    }
  ],
  "it-content": [
    {
      id: "it-content-korea",
      label: "IT 콘텐츠 한국 뉴스",
      query: 'IT 콘텐츠 OR 기술 트렌드 OR 생성형 AI OR 사이버보안 콘텐츠 OR 개발자 콘텐츠 OR 테크 콘텐츠',
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      region: "korea",
      language: "ko",
      maxAgeDays: 14
    },
    {
      id: "it-content-global",
      label: "IT content global news",
      query: '"technology content" OR "developer content" OR "AI content creation" OR "cybersecurity content" OR "tech newsletter"',
      hl: "en-US",
      gl: "US",
      ceid: "US:en",
      region: "global",
      language: "en",
      maxAgeDays: 14
    }
  ],
  education: [
    {
      id: "education-korea",
      label: "교육 트렌드 한국 뉴스",
      query: '교육 트렌드 OR 에듀테크 OR AI 교육 OR 디지털 교육 OR 교육부 AI',
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      region: "korea",
      language: "ko",
      maxAgeDays: 14
    },
    {
      id: "education-global",
      label: "Education trend global news",
      query: '"AI in education" OR edtech OR "education trend" OR "digital learning" OR "teaching with AI"',
      hl: "en-US",
      gl: "US",
      ceid: "US:en",
      region: "global",
      language: "en",
      maxAgeDays: 14
    }
  ],
  "academic-jobs": [
    {
      id: "academic-jobs-hufs",
      label: "외대 겸임교수 보조 검색",
      query: '"한국외국어대학교" "겸임교수" "모집" OR "한국외대" "겸임교수" "초빙" OR "외국어대학교" "겸임교수" "글로벌캠퍼스"',
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      region: "korea",
      language: "ko",
      maxAgeDays: 90,
      itemLimit: 3
    },
    {
      id: "academic-jobs-seoul-gyeonggi",
      label: "서울·경기 겸임교수 공고",
      query: '"겸임교수" "모집" "대학교" ("서울" OR "경기" OR "경기도")',
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      region: "korea",
      language: "ko",
      maxAgeDays: 45,
      itemLimit: 3
    },
    {
      id: "academic-jobs-chungbuk",
      label: "충북 겸임교수 공고",
      query: '"겸임교수" "모집" "대학교" ("충북" OR "충청북도" OR "청주")',
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko",
      region: "korea",
      language: "ko",
      maxAgeDays: 45,
      itemLimit: 3
    }
  ]
};

function trendLensSnapshotKey(date) {
  return `TREND_LENS#SNAPSHOT#${date}`;
}

function trendManualKey(scope) {
  return `${trendLensManualPrefix}${scope}`;
}

function trendResetKey(scope) {
  return `${trendLensResetPrefix}${scope}`;
}

function plusDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function ttlEpochSeconds(date, days) {
  return Math.floor(plusDays(date, days).getTime() / 1000);
}

function nextTrendLensRefreshAt(now) {
  const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let refreshUtc = Date.UTC(
    koreaTime.getUTCFullYear(),
    koreaTime.getUTCMonth(),
    koreaTime.getUTCDate(),
    7,
    0,
    0
  ) - 9 * 60 * 60 * 1000;
  if (refreshUtc <= now.getTime()) {
    refreshUtc += 24 * 60 * 60 * 1000;
  }

  return new Date(refreshUtc).toISOString();
}

function plannedSourceStatus(source, checkedAt, message) {
  return {
    id: source.id,
    label: source.label,
    status: "planned",
    checkedAt,
    message
  };
}

function sourceStatus(source, status, checkedAt, message) {
  return {
    id: source.id,
    label: source.label,
    status,
    checkedAt,
    message
  };
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isAllowedSourceUrl(value, source) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === source.host && url.pathname.startsWith(source.pathPrefix);
  } catch {
    return false;
  }
}

function isSafeSameHostLink(value, source) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === source.host;
  } catch {
    return false;
  }
}

function compactText(value = "", maxLength = 160) {
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function extractCveIds(...values) {
  const ids = new Set();
  values.forEach((value) => {
    const matches = String(value ?? "").match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? [];
    matches.forEach((match) => ids.add(match.toUpperCase()));
  });
  return [...ids];
}

function removeCveIds(value = "") {
  return String(value).replace(/\bCVE-\d{4}-\d{4,}\b/gi, " ");
}

function isGenericCveDescriptor(value = "") {
  const normalized = compactText(value, 90)
    .toLowerCase()
    .replace(/[^\w가-힣]+/g, "");
  return (
    !normalized ||
    normalized.length < 3 ||
    [
      "cisa",
      "kev",
      "kisa",
      "보안",
      "공지",
      "주의",
      "긴급",
      "취약점",
      "보안공지",
      "취약점정보",
      "보안업데이트",
      "보안업데이트권고",
      "보안패치",
      "보안패치권고",
      "실제악용",
      "실제악용확인"
    ].includes(normalized)
  );
}

function titleNeedsCveDescriptor(title = "") {
  const cveIds = extractCveIds(title);
  if (cveIds.length === 0) return false;

  const remainingWords = removeCveIds(title)
    .replace(/[\[\]{}()·:|/_.,\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
  if (remainingWords.length === 0) return true;

  const genericWords = new Set([
    "cisa",
    "kev",
    "kisa",
    "alert",
    "advisory",
    "and",
    "or",
    "vulnerability",
    "security",
    "update",
    "patch",
    "multiple",
    "긴급",
    "주의",
    "보안",
    "공지",
    "취약점",
    "정보",
    "업데이트",
    "패치",
    "권고",
    "관련",
    "및",
    "외",
    "실제",
    "악용",
    "확인"
  ]);
  return remainingWords.every((word) => genericWords.has(word));
}

function cleanCveDescriptor(value = "") {
  const withoutCve = removeCveIds(decodeXmlText(value))
    .replace(/\[[^\]]*(긴급|주의|공지|권고|보안)[^\]]*\]/g, " ")
    .replace(/\((긴급|주의|공지|권고|보안|패치|업데이트)\)/g, " ")
    .replace(/\b(CISA|KEV|KISA)\b/gi, " ")
    .replace(/실제\s*악용\s*확인/g, " ")
    .replace(/보안\s*(공지|업데이트|패치)\s*(권고)?/g, " ")
    .replace(/취약점\s*정보/g, " ")
    .replace(/^[-–—•·\s]+/, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (isGenericCveDescriptor(withoutCve)) return "";
  return compactText(withoutCve, 72);
}

function descriptorFromCveSummary(summary = "") {
  const cleaned = removeCveIds(decodeXmlText(summary))
    .replace(/자세한\s*내용은[\s\S]*$/i, " ")
    .replace(/상세\s*내용은[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  const candidates = cleaned
    .split(/(?:\.|。|!|\?|다\.|임\.|함\.)\s*/g)
    .map(cleanCveDescriptor)
    .filter((candidate) => candidate && !isGenericCveDescriptor(candidate));
  return candidates[0] ?? "";
}

function kevWeaknessLabel(item) {
  const text = [item?.vulnerabilityName, item?.shortDescription, item?.requiredAction, item?.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const labels = [
    [/remote code execution|\brce\b/, "원격 코드 실행"],
    [/code execution/, "코드 실행"],
    [/command injection|os command/, "명령 삽입"],
    [/sql injection/, "SQL 삽입"],
    [/cross-site scripting|\bxss\b/, "XSS"],
    [/authentication bypass|auth bypass/, "인증 우회"],
    [/privilege escalation|elevation of privilege/, "권한 상승"],
    [/information disclosure|data disclosure|exposure/, "정보 노출"],
    [/path traversal|directory traversal/, "경로 탐색"],
    [/deserialization/, "역직렬화"],
    [/use-after-free|use after free/, "Use-after-free"],
    [/buffer overflow|heap overflow|stack overflow/, "버퍼 오버플로"],
    [/server-side request forgery|\bssrf\b/, "SSRF"],
    [/cross-site request forgery|\bcsrf\b/, "CSRF"],
    [/denial of service|\bdos\b/, "서비스 거부"],
    [/input validation/, "입력 검증 미흡"],
    [/file upload/, "파일 업로드"]
  ];
  return labels.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

function kevProductLabel(item) {
  const vendor = compactText(item?.vendorProject ?? "", 42);
  const product = compactText(item?.product ?? "", 54);
  const normalized = [vendor, product]
    .filter((part) => part && !/^(unknown|n\/a|na|none)$/i.test(part))
    .join(" ");
  return compactText(normalized, 78);
}

function describeKevVulnerability(item) {
  const product = kevProductLabel(item);
  const weakness = kevWeaknessLabel(item);
  if (product && weakness) return `${product} ${weakness} 취약점`;
  if (product) return `${product} 취약점`;

  const fromName = cleanCveDescriptor(String(item?.vulnerabilityName ?? "").replace(/ vulnerability$/i, " 취약점"));
  return fromName || "취약점 정보";
}

function buildCveDescriptorMap(items) {
  const descriptors = new Map();
  items.forEach((item) => {
    const cveIds = extractCveIds(item.title, item.summary, item.id);
    if (cveIds.length === 0) return;
    const titleDescriptor = cleanCveDescriptor(item.title);
    const summaryDescriptor = descriptorFromCveSummary(item.summary);
    const descriptor = titleDescriptor || summaryDescriptor;
    if (!descriptor) return;
    cveIds.forEach((id) => {
      if (!descriptors.has(id)) descriptors.set(id, descriptor);
    });
  });
  return descriptors;
}

function enrichCveTitle(item, descriptorMap) {
  const cveIds = extractCveIds(item.title, item.summary, item.id);
  if (cveIds.length === 0 || !titleNeedsCveDescriptor(item.title)) return item;

  const descriptor =
    cveIds.map((id) => descriptorMap.get(id)).find(Boolean) ||
    descriptorFromCveSummary(item.summary) ||
    cleanCveDescriptor(item.title) ||
    "취약점 정보";
  const cveLabel = cveIds.slice(0, 2).join(", ");
  return {
    ...item,
    title: `${descriptor} · ${cveLabel}`
  };
}

function enrichSecurityCveTitles(items) {
  const descriptorMap = buildCveDescriptorMap(items);
  return items.map((item) => enrichCveTitle(item, descriptorMap));
}

function compactTrendItem(item) {
  return {
    ...item,
    title: compactText(item.title, trendLensTextLimits.title),
    summary: compactText(item.summary, trendLensTextLimits.summary),
    reasonTags: (item.reasonTags ?? [])
      .slice(0, 3)
      .map((tag) => compactText(tag, trendLensTextLimits.reasonTag))
  };
}

function compactTrendLensSnapshot(snapshot) {
  const sections = (snapshot.sections ?? []).map((section) => ({
    ...section,
    subtitle: compactText(section.subtitle, trendLensTextLimits.summary),
    focus: compactText(section.focus, trendLensTextLimits.summary),
    items: dedupeItems((section.items ?? []).map(compactTrendItem)).slice(0, 8)
  }));

  return {
    ...snapshot,
    title: compactText(snapshot.title, trendLensTextLimits.title),
    summary: compactText(snapshot.summary, trendLensTextLimits.summary),
    note: compactText(snapshot.note, trendLensTextLimits.note),
    briefItems: buildBriefItems(sections),
    sections,
    sourceStatuses: (snapshot.sourceStatuses ?? []).map((status) => ({
      ...status,
      message: compactText(status.message, trendLensTextLimits.statusMessage)
    }))
  };
}

async function readLimitedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error("Trend Lens source response is too large.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error("Trend Lens source response is too large.");
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchTrendLensSource(source, url = source.url) {
  if (!url || !isAllowedSourceUrl(url, source)) {
    throw new Error("Trend Lens source URL is not allowlisted.");
  }

  let currentUrl = url;
  const maxBytes = source.maxBytes ?? trendLensDefaultResponseLimitBytes;
  const timeoutMs = source.timeoutMs ?? trendLensSourceTimeoutMs;
  for (let redirectCount = 0; redirectCount < 2; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: source.accept,
        "user-agent": "PineflowTrendLens/0.1"
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Trend Lens source redirected without location.");
      const redirected = new URL(location, currentUrl).toString();
      if (!isAllowedSourceUrl(redirected, source)) {
        throw new Error("Trend Lens source redirected outside allowlist.");
      }
      currentUrl = redirected;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Trend Lens source returned ${response.status}.`);
    }

    return readLimitedText(response, maxBytes);
  }

  throw new Error("Trend Lens source redirected too many times.");
}

function priorityWeight(priority) {
  return { urgent: 4, high: 3, watch: 2, note: 1 }[priority] ?? 0;
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}:${item.title}:${item.sourceUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildBriefItems(sections) {
  return dedupeItems(
    sections
      .flatMap((section) => section.items)
      .sort((left, right) => {
        const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime();
      })
  ).slice(0, 5);
}

function decodeXmlText(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function rssTagValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeXmlText(match?.[1] ?? "");
}

function rssTagAttribute(item, tag, attribute) {
  const match = item.match(new RegExp(`<${tag}\\b([^>]*)>`, "i"));
  if (!match) return "";

  const attrMatch = match[1].match(new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return decodeXmlText(attrMatch?.[1] ?? attrMatch?.[2] ?? "");
}

function parseRssItems(xml, limit = 8) {
  if (xml.includes("<!ENTITY") || xml.includes("<!DOCTYPE")) {
    throw new Error("RSS entity declarations are not allowed.");
  }

  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, limit).map((match, index) => {
    const item = match[0];
    return {
      id: rssTagValue(item, "guid") || rssTagValue(item, "link") || `rss-${index}`,
      title: rssTagValue(item, "title"),
      link: rssTagValue(item, "link"),
      description: rssTagValue(item, "description"),
      publishedAt: rssTagValue(item, "pubDate"),
      sourceName: rssTagValue(item, "source"),
      sourceUrl: rssTagAttribute(item, "source", "url")
    };
  });
}

function kisaPriority(title) {
  if (/긴급|주의|위험|악용|랜섬|침해|보안 업데이트/.test(title)) return "urgent";
  if (/취약점|패치|권고|공지/.test(title)) return "high";
  return "watch";
}

function securityNewsPriority(title, summary, published, now) {
  const ageHours = Math.max(0, (now.getTime() - published.getTime()) / 36e5);
  const text = `${title} ${summary}`.toLowerCase();

  if (
    /zero-day|0-day|active exploitation|exploited|ransomware|breach|data leak|malware|botnet|supply chain|critical|emergency|apt|backdoor|spyware|제로데이|악용|랜섬|침해|유출|악성코드|치명|긴급/.test(
      text
    )
  ) {
    return ageHours <= 96 ? "urgent" : "high";
  }

  if (/vulnerability|cve-\d{4}-|patch|advisory|exploit|phishing|trojan|취약점|패치|권고|공격|피싱/.test(text)) {
    return ageHours <= 120 ? "high" : "watch";
  }

  return ageHours <= 72 ? "watch" : "note";
}

async function collectKisaRss(source, now) {
  const checkedAt = now.toISOString();
  const text = await fetchTrendLensSource(source);
  const rssItems = parseRssItems(text, 5).filter((item) => item.title && item.link);
  return {
    status: sourceStatus(source, rssItems.length > 0 ? "ready" : "partial", checkedAt, `${rssItems.length}개 한국 보안 신호를 반영했습니다.`),
    items: rssItems.map((item) => {
      const published = item.publishedAt ? new Date(item.publishedAt) : now;
      const sourceUrl = isSafeSameHostLink(item.link, source) ? item.link : source.url;
      return {
        id: `${source.id}-${item.id}`.slice(0, 180),
        category: "security",
        priority: kisaPriority(item.title),
        title: item.title,
        summary: item.description || "KISA 보호나라 공식 RSS에서 확인한 한국 우선 보안 신호입니다.",
        sourceName: source.label,
        sourceUrl,
        publishedAt: Number.isNaN(published.getTime()) ? now.toISOString() : published.toISOString(),
        region: "korea",
        language: "ko",
        reasonTags: ["한국 우선", "공식", "보안 신호"]
      };
    })
  };
}

async function collectSecurityNewsRss(source, now) {
  const checkedAt = now.toISOString();
  const text = await fetchTrendLensSource(source);
  const rssItems = parseRssItems(text, 10)
    .filter((item) => item.title && item.link && item.publishedAt)
    .filter((item) => !isStaticKnowledgeNewsItem(item))
    .map((item) => ({
      ...item,
      published: new Date(item.publishedAt)
    }))
    .filter((item) => isRecentEnough(item.published, now, source.maxAgeDays))
    .slice(0, 3);

  return {
    status: sourceStatus(
      source,
      rssItems.length > 0 ? "ready" : "partial",
      checkedAt,
      `${rssItems.length}개 전문 보안 뉴스를 반영했습니다. 공식 공지가 아니라 빠른 현장 신호로 봅니다.`
    ),
    items: rssItems.map((item) => {
      const title = cleanNewsTitle(item.title, source.label);
      const summary = compactText(item.description, 190) || "전문 보안 매체에서 확인한 빠른 보안 뉴스입니다.";
      const sourceUrl = isDisplayableNewsUrl(item.link) ? item.link : source.url;
      return {
        id: `security-news-${source.id}-${item.id}`.slice(0, 180),
        category: "security",
        priority: securityNewsPriority(title, summary, item.published, now),
        title,
        summary,
        sourceName: source.label,
        sourceUrl,
        publishedAt: item.published.toISOString(),
        region: source.region,
        language: source.language,
        reasonTags: ["전문 매체", "빠른 보안 뉴스", source.label]
      };
    })
  };
}

async function collectCisaKev(now) {
  const checkedAt = now.toISOString();
  const text = await fetchTrendLensSource(trendLensSources.cisaKev);
  const data = safeParseJson(text);
  const vulnerabilities = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : [];
  const recent = vulnerabilities
    .filter((item) => item?.cveID && item?.dateAdded)
    .sort((left, right) => new Date(right.dateAdded).getTime() - new Date(left.dateAdded).getTime())
    .slice(0, 5);

  return {
    status: sourceStatus(trendLensSources.cisaKev, recent.length > 0 ? "ready" : "partial", checkedAt, `${recent.length}개 KEV 신호를 반영했습니다.`),
    items: recent.map((item) => {
      const dateAdded = new Date(item.dateAdded);
      const ageHours = Math.max(0, (now.getTime() - dateAdded.getTime()) / 36e5);
      const descriptor = describeKevVulnerability(item);
      const summary = item.shortDescription
        ? `${compactText(item.shortDescription, 220)} 한국 환경 영향 여부를 먼저 확인해야 합니다.`
        : `${descriptor}이 CISA KEV에 등록되었습니다. 한국 환경 영향 여부를 먼저 확인해야 합니다.`;
      return {
        id: `cisa-kev-${item.cveID}`,
        category: "security",
        priority: ageHours <= 72 ? "urgent" : "high",
        title: `${descriptor} · ${item.cveID}`,
        summary,
        sourceName: "CISA KEV",
        sourceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
        publishedAt: item.dateAdded,
        region: "global",
        language: "en",
        reasonTags: ["공식", "실제 악용", item.knownRansomwareCampaignUse === "Known" ? "랜섬웨어 연관" : "패치 점검"]
      };
    })
  };
}

function googleNewsUrl(feed) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", `${feed.query} when:${feed.maxAgeDays}d`);
  url.searchParams.set("hl", feed.hl);
  url.searchParams.set("gl", feed.gl);
  url.searchParams.set("ceid", feed.ceid);
  return url.toString();
}

function sourceForNewsFeed(feed) {
  return {
    ...trendLensSources.googleNews,
    id: `google-news-${feed.id}`,
    label: feed.label
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanNewsTitle(title, sourceName) {
  const normalized = compactText(title, 220);
  if (!sourceName) return normalized;
  return normalized.replace(new RegExp(`\\s+-\\s+${escapeRegExp(sourceName)}$`, "i"), "").trim();
}

function isStaticKnowledgeNewsItem(item) {
  const text = `${item.title} ${item.sourceName ?? ""} ${item.link} ${item.sourceUrl ?? ""}`.toLowerCase();
  return /wikipedia|wikimedia|wikiwand|britannica|encyclopedia|fandom|dbpedia/.test(text);
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isGoogleNewsInterstitialUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.hostname === trendLensSources.googleNews.host &&
      (url.pathname.startsWith("/rss/articles/") ||
        url.pathname.startsWith("/articles/") ||
        url.pathname.startsWith("/read/"))
    );
  } catch {
    return false;
  }
}

function googleNewsArticleId(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== trendLensSources.googleNews.host) return "";
    const match = url.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/i) || url.pathname.match(/\/read\/([^/?#]+)/i);
    return decodeURIComponent(match?.[1] ?? "");
  } catch {
    return "";
  }
}

function googleNewsArticlePageUrl(articleId, feed) {
  const url = new URL(`https://news.google.com/articles/${encodeURIComponent(articleId)}`);
  url.searchParams.set("hl", feed.hl);
  url.searchParams.set("gl", feed.gl);
  url.searchParams.set("ceid", feed.ceid);
  return url.toString();
}

function isAllowedGoogleNewsDecodeUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === trendLensSources.googleNews.host &&
      (url.pathname.startsWith("/articles/") || url.pathname === "/_/DotsSplashUi/data/batchexecute")
    );
  } catch {
    return false;
  }
}

async function fetchGoogleNewsDecodeText(url, options = {}) {
  if (!isAllowedGoogleNewsDecodeUrl(url)) {
    throw new Error("Google News decode URL is not allowlisted.");
  }

  const timeoutMs = options.timeoutMs ?? googleNewsDecodeTimeoutMs;
  const maxBytes = options.maxBytes ?? googleNewsDecodeResponseLimitBytes;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount < 2; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      method: options.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: options.accept ?? "text/html, application/xhtml+xml, */*",
        "content-type": options.contentType ?? "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "PineflowTrendLens/0.1"
      },
      body: options.body
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Google News decode redirected without location.");
      const redirected = new URL(location, currentUrl).toString();
      if (!isAllowedGoogleNewsDecodeUrl(redirected)) {
        throw new Error("Google News decode redirected outside allowlist.");
      }
      currentUrl = redirected;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Google News decode returned ${response.status}.`);
    }

    return readLimitedText(response, maxBytes);
  }

  throw new Error("Google News decode redirected too many times.");
}

function googleNewsDecodeParamsFromHtml(html) {
  const timestamp = decodeXmlText(html.match(/data-n-a-ts="([^"]+)"/i)?.[1] ?? "");
  const signature = decodeXmlText(html.match(/data-n-a-sg="([^"]+)"/i)?.[1] ?? "");
  const articleId = decodeXmlText(html.match(/data-n-a-id="([^"]+)"/i)?.[1] ?? "");
  if (!timestamp || !signature) return null;
  return { articleId, timestamp, signature };
}

function googleNewsDecodeRequestBody(articleId, params, feed) {
  const request = [
    "garturlreq",
    [
      [feed.hl, feed.gl, ["FINANCE_TOP_INDICES"], null, null, 1, 1, feed.ceid, null, 180, null, null, null, null, null, 0],
      feed.hl,
      feed.gl,
      1,
      [2, 3, 4, 8],
      1,
      0,
      "655000234",
      0,
      0,
      null,
      0
    ],
    articleId,
    Number(params.timestamp),
    params.signature
  ];
  return new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(request), null, "generic"]]])
  }).toString();
}

function googleNewsDirectUrlFromBatchResponse(text) {
  const jsonText = text.replace(/^\)\]\}'\s*/, "").trim();
  const rows = safeParseJson(jsonText);
  if (!Array.isArray(rows)) return "";

  const responseRow = rows.find((row) => Array.isArray(row) && row[0] === "wrb.fr" && row[1] === "Fbv4je");
  if (!responseRow || typeof responseRow[2] !== "string") return "";

  const payload = safeParseJson(responseRow[2]);
  const directUrl = Array.isArray(payload) && payload[0] === "garturlres" ? payload[1] : "";
  return isDisplayableNewsUrl(directUrl) ? directUrl : "";
}

async function resolveGoogleNewsDirectUrl(value, feed) {
  const articleId = googleNewsArticleId(value);
  if (!articleId) return "";

  const html = await fetchGoogleNewsDecodeText(googleNewsArticlePageUrl(articleId, feed), {
    maxBytes: googleNewsDecodePageLimitBytes,
    timeoutMs: googleNewsDecodeTimeoutMs
  });
  const params = googleNewsDecodeParamsFromHtml(html);
  if (!params) return "";

  const decodeArticleId = params.articleId || articleId;
  const url = new URL("https://news.google.com/_/DotsSplashUi/data/batchexecute");
  url.searchParams.set("rpcids", "Fbv4je");
  const response = await fetchGoogleNewsDecodeText(url.toString(), {
    method: "POST",
    accept: "*/*",
    body: googleNewsDecodeRequestBody(decodeArticleId, params, feed),
    maxBytes: googleNewsDecodeResponseLimitBytes,
    timeoutMs: googleNewsDecodeTimeoutMs
  });

  return googleNewsDirectUrlFromBatchResponse(response);
}

function isStaticKnowledgeUrl(value) {
  try {
    const url = new URL(value);
    const text = `${url.hostname} ${url.pathname}`.toLowerCase();
    return /wikipedia|wikimedia|wikiwand|britannica|encyclopedia|fandom|dbpedia/.test(text);
  } catch {
    return false;
  }
}

function isDisplayableNewsUrl(value) {
  if (!isPublicHttpsUrl(value)) return false;
  if (isGoogleNewsInterstitialUrl(value)) return false;
  if (isStaticKnowledgeUrl(value)) return false;

  try {
    const url = new URL(value);
    const articlePath = url.pathname.replace(/\/+$/, "");
    return url.hostname !== trendLensSources.googleNews.host && articlePath.length > 0;
  } catch {
    return false;
  }
}

function googleNewsSearchFallbackUrl(feed, title, sourceName) {
  const url = new URL("https://news.google.com/search");
  url.searchParams.set("q", [title, sourceName].filter(Boolean).join(" "));
  url.searchParams.set("hl", feed.hl);
  url.searchParams.set("gl", feed.gl);
  url.searchParams.set("ceid", feed.ceid);
  return url.toString();
}

function newsSourceUrlFor(item, feed, title, sourceName) {
  if (isDisplayableNewsUrl(item.sourceUrl)) return item.sourceUrl;
  if (isDisplayableNewsUrl(item.link)) return item.link;
  return googleNewsSearchFallbackUrl(feed, title, sourceName);
}

async function directNewsSourceUrlFor(item, feed, title, sourceName) {
  const fallbackUrl = newsSourceUrlFor(item, feed, title, sourceName);
  if (isDisplayableNewsUrl(fallbackUrl)) return fallbackUrl;

  try {
    const directUrl = await resolveGoogleNewsDirectUrl(item.link, feed);
    if (directUrl) return directUrl;
  } catch {
    return fallbackUrl;
  }

  return fallbackUrl;
}

function isRecentEnough(published, now, maxAgeDays) {
  if (Number.isNaN(published.getTime())) return false;
  const ageMs = now.getTime() - published.getTime();
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function newsPriority(category, title, published, now) {
  const ageHours = Math.max(0, (now.getTime() - published.getTime()) / 36e5);
  const text = title.toLowerCase();

  if (category === "academic-jobs") {
    if (/한국외국어|한국외대|외국어대학교|hufs/i.test(title)) {
      return ageHours <= 720 ? "high" : "watch";
    }
    return ageHours <= 336 ? "watch" : "note";
  }

  if (category === "mandolin") {
    if (/concert|festival|competition|masterclass|recital|공연|콩쿠르|마스터클래스|페스티벌|리사이틀/.test(text)) {
      return ageHours <= 240 ? "high" : "watch";
    }
    return ageHours <= 336 ? "watch" : "note";
  }

  if (/breaking|launch|released|report|survey|trend|policy|guideline|ai|security|사이버|보안|생성형|트렌드|정책|보고서|발표|출시/.test(text)) {
    return ageHours <= 72 ? "high" : "watch";
  }

  return ageHours <= 96 ? "watch" : "note";
}

function newsSummaryFor(item, feed) {
  const description = compactText(item.description, 180);
  if (description) return description;
  if (feed.id.startsWith("academic-jobs")) return "겸임교수 모집 공고 후보입니다. 원문 공고의 지원 자격과 접수 마감일을 확인해야 합니다.";
  if (feed.id.startsWith("mandolin")) return "만돌린 연주, 아티스트, 레슨, 공연 흐름을 확인할 수 있는 최신 소식입니다.";
  if (feed.id.startsWith("education")) return "교육 방법, 에듀테크, AI 학습 흐름을 따라가기 위한 최신 소식입니다.";
  return "IT 콘텐츠 제작과 기술 흐름을 따라가기 위한 최신 소식입니다.";
}

function isAcademicJobNoticeTitle(title = "") {
  const text = decodeXmlText(title).replace(/\s+/g, " ").trim();
  if (!/겸임/.test(text)) return false;
  if (!/(모집|초빙|채용|공고|임용|위촉)/.test(text)) return false;
  return !/(합격자|발표|결과|서류|면접|직원|조교|근로자|대학원생)/.test(text);
}

function isRelevantNewsItem(category, item) {
  if (category !== "academic-jobs") return true;
  const text = `${item.title} ${item.description ?? ""}`;
  return isAcademicJobNoticeTitle(text);
}

function academicJobTags(title = "", sourceName = "") {
  const tags = ["겸임교수 공고"];
  if (/한국외국어|한국외대|외국어대학교|HUFS/i.test(`${title} ${sourceName}`)) tags.push("외대 확인");
  if (/글로벌|용인/.test(title)) tags.push("글로벌캠퍼스");
  if (/서울/.test(title)) tags.push("서울");
  if (/경기|경기도|용인|수원|성남|안양|고양|부천|안산|화성|평택|의정부/.test(title)) tags.push("경기");
  if (/충북|충청북도|청주|충주|제천/.test(title)) tags.push("충북");
  return tags.slice(0, 4);
}

function isoDateFromDottedDate(value = "") {
  const match = String(value).match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function hufsArticleUrl(href = "") {
  try {
    const url = new URL(href, "https://www.hufs.ac.kr");
    if (url.protocol !== "https:" || url.hostname !== trendLensSources.hufsRecruitment.host) return "";
    if (!url.pathname.startsWith("/bbs/hufs/")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function hufsArticleId(url = "") {
  return new URL(url).pathname.match(/\/(\d+)\/artclView\.do$/)?.[1] ?? url;
}

function parseHufsRecruitmentItems(html) {
  return [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
    .map((match) => {
      const row = match[0];
      const subjectMatch = row.match(
        /<td[^>]*class="[^"]*\btd-subject\b[^"]*"[\s\S]*?<a[^>]+href="([^"]*artclView\.do[^"]*)"[^>]*>([\s\S]*?)<\/a>/i
      );
      if (!subjectMatch) return null;

      const sourceUrl = hufsArticleUrl(subjectMatch[1]);
      if (!sourceUrl) return null;

      const title = compactText(decodeXmlText(subjectMatch[2]), trendLensTextLimits.title);
      if (!isAcademicJobNoticeTitle(title)) return null;

      const dateText = decodeXmlText(row.match(/<td[^>]*class="[^"]*\btd-date\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "");
      const publishedAt = isoDateFromDottedDate(dateText);
      if (!publishedAt) return null;

      return {
        id: `hufs-recruitment-${hufsArticleId(sourceUrl)}`,
        category: "academic-jobs",
        priority: /글로벌|용인/.test(title) ? "high" : "watch",
        title,
        summary: "한국외국어대학교 공식 채용 게시판에서 확인한 겸임교수 모집 공고입니다. 원문에서 캠퍼스, 전공, 접수 마감일을 확인하세요.",
        sourceName: "한국외대 채용",
        sourceUrl,
        publishedAt,
        region: "korea",
        language: "ko",
        reasonTags: ["한국외대 공식", ...academicJobTags(title, "한국외대 채용")].slice(0, 4)
      };
    })
    .filter(Boolean);
}

async function collectHufsRecruitmentBoard(now) {
  const checkedAt = now.toISOString();
  const text = await fetchTrendLensSource(trendLensSources.hufsRecruitment);
  const items = parseHufsRecruitmentItems(text).slice(0, 6);

  return {
    status: sourceStatus(
      trendLensSources.hufsRecruitment,
      "ready",
      checkedAt,
      items.length > 0
        ? `한국외대 공식 채용 게시판에서 겸임교수 공고 ${items.length}개를 확인했습니다.`
        : "한국외대 공식 채용 게시판을 확인했으며, 현재 겸임교수 모집 공고는 발견하지 못했습니다."
    ),
    items
  };
}

function isoDateFromShortDottedDate(value = "") {
  const match = String(value).match(/(\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (!match) return "";
  return `20${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function hibrainRecruitUrl(href = "") {
  try {
    const url = new URL(href, "https://www.hibrain.net");
    if (url.protocol !== "https:" || url.hostname !== trendLensSources.hibrainRecruitment.host) return "";
    if (!/^\/recruitment\/recruits\/\d+$/.test(url.pathname)) return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function hibrainRecruitId(url = "") {
  return new URL(url).pathname.match(/\/(\d+)$/)?.[1] ?? url;
}

function isDeadlineWithinDays(isoDate, now, days) {
  if (!isoDate) return false;
  const deadline = new Date(`${isoDate}T23:59:59+09:00`).getTime();
  if (Number.isNaN(deadline)) return false;
  const diff = deadline - now.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function parseHibrainRecruitmentItems(html, now) {
  const seen = new Set();
  return [...html.matchAll(/<a\b[^>]*href="([^"]*\/recruitment\/recruits\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => {
      const sourceUrl = hibrainRecruitUrl(match[1]);
      if (!sourceUrl) return null;

      const inner = compactText(decodeXmlText(match[2]), 400);
      if (!inner) return null;

      const title = compactText(
        inner.replace(/\s*\b\d{2}\.\d{1,2}\.\d{1,2}\b[\s\S]*$/, "").replace(/^\d{1,3}\s+/, ""),
        trendLensTextLimits.title
      );
      if (!isAcademicJobNoticeTitle(title)) return null;

      const range = inner.match(/(\d{2}\.\d{1,2}\.\d{1,2})\s*~\s*(\d{2}\.\d{1,2}\.\d{1,2})/);
      const deadline = range ? isoDateFromShortDottedDate(range[2]) : "";
      const dates = [...inner.matchAll(/\d{2}\.\d{1,2}\.\d{1,2}/g)].map((entry) => entry[0]);
      const publishedAt = dates.length > 0 ? isoDateFromShortDottedDate(dates[dates.length - 1]) : deadline;
      if (!publishedAt) return null;

      const id = `hibrain-recruitment-${hibrainRecruitId(sourceUrl)}`;
      if (seen.has(id)) return null;
      seen.add(id);

      return {
        id,
        category: "academic-jobs",
        priority: isDeadlineWithinDays(deadline, now, 14) ? "high" : "watch",
        title,
        summary: deadline
          ? `하이브레인넷에서 확인한 겸임교수 모집 공고입니다. 접수 마감 ${deadline}. 원문에서 대학/기관, 전공, 지원 자격, 첨부파일을 확인하세요.`
          : "하이브레인넷에서 확인한 겸임교수 모집 공고입니다. 원문에서 대학/기관, 전공, 접수 마감일, 첨부파일을 확인하세요.",
        sourceName: "하이브레인넷",
        sourceUrl,
        publishedAt,
        region: "korea",
        language: "ko",
        reasonTags: ["하이브레인넷", ...academicJobTags(title, "하이브레인넷")].slice(0, 4)
      };
    })
    .filter(Boolean);
}

async function collectHibrainRecruitmentBoard(now) {
  const checkedAt = now.toISOString();
  const text = await fetchTrendLensSource(trendLensSources.hibrainRecruitment);
  const anchorCount = (text.match(/\/recruitment\/recruits\/\d+/g) ?? []).length;
  const items = parseHibrainRecruitmentItems(text, now).slice(0, 6);

  return {
    status: sourceStatus(
      trendLensSources.hibrainRecruitment,
      "ready",
      checkedAt,
      items.length > 0
        ? `하이브레인넷 신규 공고에서 겸임교수 모집 ${items.length}개를 확인했습니다.`
        : `하이브레인넷 신규 공고 목록을 확인했습니다(공고 링크 ${anchorCount}개). 현재 겸임교수 모집 공고는 발견하지 못했습니다.`
    ),
    items
  };
}

async function collectNewsFeed(category, feed, now) {
  const checkedAt = now.toISOString();
  const source = sourceForNewsFeed(feed);
  const text = await fetchTrendLensSource(trendLensSources.googleNews, googleNewsUrl(feed));
  const itemLimit = feed.itemLimit ?? trendLensNewsItemsPerFeed;
  const rssItems = parseRssItems(text, Math.max(12, itemLimit * 4))
    .filter((item) => item.title && item.link && item.publishedAt)
    .filter((item) => !isStaticKnowledgeNewsItem(item))
    .filter((item) => isRelevantNewsItem(category, item))
    .map((item) => ({
      ...item,
      published: new Date(item.publishedAt)
    }))
    .filter((item) => isRecentEnough(item.published, now, feed.maxAgeDays))
    .slice(0, itemLimit);

  return {
    status: sourceStatus(
      source,
      rssItems.length > 0 ? "ready" : "partial",
      checkedAt,
      `${rssItems.length}개 최신 소식을 반영했습니다. 백과/위키 계열 정적 문서는 제외합니다.`
    ),
    items: await Promise.all(rssItems.map(async (item) => {
      const sourceName = item.sourceName || source.label;
      const title = cleanNewsTitle(item.title, sourceName);
      const sourceUrl = await directNewsSourceUrlFor(item, feed, title, sourceName);
      return {
        id: `news-${feed.id}-${item.id}`.slice(0, 180),
        category,
        priority: newsPriority(category, title, item.published, now),
        title,
        summary: newsSummaryFor(item, feed),
        sourceName,
        sourceUrl,
        publishedAt: item.published.toISOString(),
        region: feed.region,
        language: feed.language,
        reasonTags: [
          ...(category === "academic-jobs" ? academicJobTags(title, sourceName) : [feed.region === "korea" ? "한국 우선" : "글로벌 보조"]),
          sourceName,
          category === "academic-jobs" ? "모집 공고" : "최신 소식"
        ].slice(0, 4)
      };
    }))
  };
}

async function collectNewsSection(category, now) {
  const feeds = topicNewsFeeds[category] ?? [];
  const results = await Promise.allSettled(feeds.map((feed) => collectNewsFeed(category, feed, now)));
  const items = results
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value.items)
    .sort((left, right) => {
      const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime();
    })
    .slice(0, 6);
  const failures = results.filter((result) => result.status === "rejected").length;
  const statuses = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value.status;
    const source = sourceForNewsFeed(feeds[index]);
    return sourceStatus(source, "unavailable", now.toISOString(), `${source.label} 최신 소식을 불러오지 못했습니다.`);
  });

  return {
    statuses,
    failures,
    items
  };
}

function emptyTrendSections() {
  return trendLensSections.map((section) => ({ ...section, items: [] }));
}

function trendSectionBase(id) {
  return trendLensSections.find((section) => section.id === id) ?? {
    id,
    title: id,
    subtitle: "Trend Lens section",
    focus: "수집 규칙을 확인해야 합니다."
  };
}

function mergeTrendSections(existingSections, updates) {
  const sectionMap = new Map((existingSections?.length ? existingSections : emptyTrendSections()).map((section) => [section.id, section]));
  updates.forEach((section) => {
    sectionMap.set(section.id, {
      ...section,
      items: dedupeItems(section.items ?? []).slice(0, 8)
    });
  });

  return trendLensSections.map((section) => ({
    ...section,
    items: sectionMap.get(section.id)?.items ?? []
  }));
}

async function buildTrendLensSnapshot(scope = "all", previousSnapshot = null) {
  const now = new Date();
  const statuses = [
    plannedSourceStatus(
      trendLensSources.googleTrendsPlanned,
      now.toISOString(),
      "아직 자동 수집하지 않습니다. 공식 API 비용, 키 관리, 이용 조건을 확인한 뒤 연결할 후보 소스입니다."
    )
  ];
  const updates = [];

  if (scope === "all" || scope === "security") {
    const securityResults = await Promise.allSettled([
      collectKisaRss(trendLensSources.kisaSecurityNotice, now),
      collectKisaRss(trendLensSources.kisaVulnerability, now),
      collectCisaKev(now),
      ...securityNewsSources.map((source) => collectSecurityNewsRss(source, now))
    ]);
    const securitySources = [
      trendLensSources.kisaSecurityNotice,
      trendLensSources.kisaVulnerability,
      trendLensSources.cisaKev,
      ...securityNewsSources
    ];
    const securityItems = securityResults.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        statuses.push(result.value.status);
        return result.value.items;
      }

      const source = securitySources[index];
      statuses.push(sourceStatus(source, "unavailable", now.toISOString(), `${source.label}를 불러오지 못했습니다. 마지막 캐시가 있으면 그대로 사용합니다.`));
      return [];
    });
    updates.push({
      ...trendSectionBase("security"),
      items: dedupeItems(enrichSecurityCveTitles(securityItems))
        .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))
        .slice(0, 8)
    });
  }

  if (scope === "all" || scope === "academic") {
    const academicBoards = [
      {
        source: trendLensSources.hufsRecruitment,
        promise: collectHufsRecruitmentBoard(now),
        failMessage: "한국외대 공식 채용 게시판을 확인하지 못했습니다. 보조 검색 결과가 있으면 함께 표시합니다."
      },
      {
        source: trendLensSources.hibrainRecruitment,
        promise: collectHibrainRecruitmentBoard(now),
        failMessage: "하이브레인넷 신규 공고를 확인하지 못했습니다. 다른 공고 source 결과가 있으면 함께 표시합니다."
      }
    ];

    // academic scope는 겸임교수 보드만 가볍게 갱신해 8초 안에 안정적으로 끝낸다.
    // all scope에서만 다른 분야 뉴스까지 함께 모은다.
    const categories = scope === "all"
      ? ["mandolin", "it-content", "education", "academic-jobs"]
      : ["academic-jobs"];
    // 채용 게시판 수집과 분야별 뉴스 수집을 모두 동시에 실행해 Lambda timeout 여유를 확보한다.
    const [boardResults, sectionResults] = await Promise.all([
      Promise.allSettled(academicBoards.map((board) => board.promise)),
      Promise.allSettled(categories.map((category) => collectNewsSection(category, now)))
    ]);

    const academicBoardItems = [];
    boardResults.forEach((result, index) => {
      const board = academicBoards[index];
      if (result.status === "fulfilled") {
        statuses.push(result.value.status);
        academicBoardItems.push(...result.value.items);
      } else {
        statuses.push(sourceStatus(board.source, "unavailable", now.toISOString(), board.failMessage));
      }
    });

    sectionResults.forEach((result, index) => {
      const category = categories[index];
      if (result.status === "fulfilled") {
        statuses.push(...result.value.statuses);
        const items =
          category === "academic-jobs"
            ? dedupeItems([...academicBoardItems, ...result.value.items])
                .sort((left, right) => {
                  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
                  if (priorityDiff !== 0) return priorityDiff;
                  return new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime();
                })
                .slice(0, 8)
            : result.value.items;
        updates.push({ ...trendSectionBase(category), items });
      } else {
        statuses.push(sourceStatus(trendLensSources.googleNews, "unavailable", now.toISOString(), `${category} 최신 소식을 불러오지 못했습니다.`));
        if (category === "academic-jobs") {
          updates.push({ ...trendSectionBase(category), items: academicBoardItems });
        }
      }
    });
  }

  const sections = mergeTrendSections(scope === "all" ? emptyTrendSections() : previousSnapshot?.sections, updates);
  const briefItems = buildBriefItems(sections);
  const hasReady = statuses.some((status) => status.status === "ready");
  const hasUnavailable = statuses.some((status) => status.status === "unavailable");

  return compactTrendLensSnapshot({
    generatedAt: now.toISOString(),
    cacheDate: cacheDateFor(now),
    cacheStatus: hasReady && hasUnavailable ? "partial" : hasReady ? "fresh" : "unavailable",
    scope,
    title: "Trend Lens",
    summary: "한국 우선으로 하루에 한 번 정리하고, 공식 보안 위험 신호는 더 빠르게 확인하는 지식 브리프입니다.",
    nextScheduledRefreshAt: nextTrendLensRefreshAt(now),
    nextManualRefreshAllowedAt: new Date(now.getTime() + trendLensManualCooldownMs[scope]).toISOString(),
    sections,
    briefItems,
    sourceStatuses: statuses,
    note: "원문 전문을 저장하지 않고 제목, 링크, 짧은 요약, 우선순위 근거만 보관합니다."
  });
}

async function loadTrendLensSnapshot() {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk: trendLensPk, sk: trendLensLatestSk })
    })
  );
  const cached = itemToObject(result.Item);
  if (!cached?.payload) return null;

  try {
    const snapshot = JSON.parse(cached.payload);
    return {
      ...snapshot,
      cacheStatus: snapshot.cacheDate === cacheDateFor(new Date()) ? "cached" : "stale"
    };
  } catch {
    return null;
  }
}

function trendLensPlaceholderSnapshot() {
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    cacheDate: cacheDateFor(now),
    cacheStatus: "unavailable",
    scope: "all",
    title: "Trend Lens",
    summary: "아직 오늘 브리프가 준비되지 않았습니다. 수동 갱신을 실행하거나 다음 자동 수집을 기다려주세요.",
    nextScheduledRefreshAt: nextTrendLensRefreshAt(now),
    nextManualRefreshAllowedAt: now.toISOString(),
    sections: emptyTrendSections(),
    briefItems: [],
    sourceStatuses: [
      sourceStatus(trendLensSources.kisaSecurityNotice, "unavailable", now.toISOString(), "첫 보안 RSS 수집 전입니다."),
      sourceStatus(trendLensSources.kisaVulnerability, "unavailable", now.toISOString(), "첫 취약점 RSS 수집 전입니다."),
      sourceStatus(trendLensSources.cisaKev, "unavailable", now.toISOString(), "첫 CISA KEV 수집 전입니다."),
      ...securityNewsSources.map((source) =>
        sourceStatus(source, "unavailable", now.toISOString(), `첫 ${source.label} 수집 전입니다.`)
      ),
      sourceStatus(trendLensSources.hufsRecruitment, "unavailable", now.toISOString(), "첫 한국외대 채용 게시판 확인 전입니다."),
      sourceStatus(trendLensSources.googleNews, "unavailable", now.toISOString(), "첫 Google News RSS 수집 전입니다."),
      plannedSourceStatus(trendLensSources.googleTrendsPlanned, now.toISOString(), "아직 자동 수집하지 않습니다. 공식 API 비용, 키 관리, 이용 조건을 확인한 뒤 연결할 후보 소스입니다.")
    ],
    note: "첫 수집 전에는 외부 호출 없이 준비 상태만 보여줍니다."
  };
}

async function saveTrendLensSnapshot(snapshot) {
  const payload = JSON.stringify(snapshot);
  const expiresAt = ttlEpochSeconds(new Date(snapshot.generatedAt), trendLensSnapshotTtlDays);
  const baseItem = {
    pk: trendLensPk,
    entityType: "TREND_LENS_SNAPSHOT",
    cacheDate: snapshot.cacheDate,
    generatedAt: snapshot.generatedAt,
    expiresAt,
    payload
  };

  await Promise.all([
    dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: objectToItem({ ...baseItem, sk: trendLensLatestSk })
      })
    ),
    dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: objectToItem({ ...baseItem, sk: trendLensSnapshotKey(snapshot.cacheDate) })
      })
    )
  ]);
}

async function loadTrendManualGuard(scope) {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk: trendLensPk, sk: trendManualKey(scope) })
    })
  );
  return itemToObject(result.Item);
}

async function saveTrendManualGuard(scope, now) {
  await dynamodb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: objectToItem({
        pk: trendLensPk,
        sk: trendManualKey(scope),
        entityType: "TREND_LENS_MANUAL_GUARD",
        scope,
        lastManualRefreshAt: now.toISOString(),
        expiresAt: ttlEpochSeconds(now, 2)
      })
    })
  );
}

async function loadTrendResetGuard(scope) {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk: trendLensPk, sk: trendResetKey(scope) })
    })
  );
  return itemToObject(result.Item);
}

async function saveTrendResetGuard(scope, now) {
  await dynamodb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: objectToItem({
        pk: trendLensPk,
        sk: trendResetKey(scope),
        entityType: "TREND_LENS_RESET_GUARD",
        scope,
        lastResetRefreshAt: now.toISOString(),
        expiresAt: ttlEpochSeconds(now, 1)
      })
    })
  );
}

async function clearTrendLensCache() {
  const items = [];
  let ExclusiveStartKey;

  do {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ProjectionExpression: "pk, sk",
        ExpressionAttributeValues: {
          ":pk": { S: trendLensPk }
        },
        ExclusiveStartKey
      })
    );

    items.push(
      ...(result.Items ?? [])
        .map(itemToObject)
        .filter((item) => item?.pk && (item.sk === trendLensLatestSk || item.sk?.startsWith("TREND_LENS#SNAPSHOT#")))
    );
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);
    if (chunk.length === 0) continue;

    await dynamodb.send(
      new TransactWriteItemsCommand({
        TransactItems: chunk.map((item) => ({
          Delete: {
            TableName: tableName,
            Key: objectToItem({ pk: item.pk, sk: item.sk })
          }
        }))
      })
    );
  }

  return items.length;
}

async function refreshTrendLensSnapshot(scope = "all", source = "manual", options = {}) {
  const normalizedScope = scope === "security" || scope === "academic" ? scope : "all";
  const now = new Date();
  let clearedCacheItems = 0;

  if (source === "manual" && options.reset) {
    const resetGuard = await loadTrendResetGuard(normalizedScope);
    const lastResetAt = resetGuard?.lastResetRefreshAt ? new Date(resetGuard.lastResetRefreshAt).getTime() : 0;
    const nextResetAllowedAt = lastResetAt + trendLensResetCooldownMs;
    if (lastResetAt && nextResetAllowedAt > now.getTime()) {
      return json(429, {
        error: "Trend Lens를 방금 완전히 새로 받았습니다. 잠시 후 다시 시도해주세요.",
        nextManualRefreshAllowedAt: new Date(nextResetAllowedAt).toISOString()
      });
    }
    clearedCacheItems = await clearTrendLensCache();
  }

  if (source === "manual" && !options.reset) {
    const guard = await loadTrendManualGuard(normalizedScope);
    const lastManualAt = guard?.lastManualRefreshAt ? new Date(guard.lastManualRefreshAt).getTime() : 0;
    const cooldown = options.force ? trendLensForcedCooldownMs[normalizedScope] : trendLensManualCooldownMs[normalizedScope];
    const nextAllowedAt = lastManualAt + cooldown;
    if (lastManualAt && nextAllowedAt > now.getTime()) {
      return json(429, {
        error: "Trend Lens는 방금 갱신했습니다. 잠시 후 다시 시도해주세요.",
        nextManualRefreshAllowedAt: new Date(nextAllowedAt).toISOString()
      });
    }
  }

  const previousSnapshot = options.reset ? null : await loadTrendLensSnapshot();
  const snapshot = await buildTrendLensSnapshot(normalizedScope, previousSnapshot);
  if (options.reset) {
    snapshot.note = `${snapshot.note} 기존 Trend Lens 캐시 ${clearedCacheItems}개를 비우고 다시 수집했습니다.`;
  }
  await saveTrendLensSnapshot(snapshot);

  if (source === "manual") {
    await saveTrendManualGuard(normalizedScope, now);
    if (options.reset) {
      await saveTrendResetGuard(normalizedScope, now);
    }
  }

  return json(200, snapshot);
}

async function handleTrendLensSchedule(event) {
  const task = event?.pineflowTask;
  if (task === "trend-lens-daily-refresh") {
    await refreshTrendLensSnapshot("all", "scheduled");
    return { ok: true, task };
  }
  if (task === "trend-lens-security-refresh") {
    await refreshTrendLensSnapshot("security", "scheduled");
    return { ok: true, task };
  }
  if (task === "trend-lens-academic-refresh") {
    await refreshTrendLensSnapshot("academic", "scheduled");
    return { ok: true, task };
  }

  return { ok: false, task: task ?? "unknown" };
}

function parseRecordId(recordId) {
  if (typeof recordId !== "string") return null;

  const match = recordId.match(/^(.+):(in|out)$/);
  if (!match) return null;

  return { sessionId: match[1], kind: match[2] };
}

function recordIdFromPath(path) {
  try {
    const recordId = decodeURIComponent(path.slice("/api/records/".length));
    return recordId.trim() ? recordId : null;
  } catch {
    return null;
  }
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") return null;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;

  const now = Date.now();
  const oneYearAgo = now - 366 * 24 * 60 * 60 * 1000;
  const fiveMinutesFromNow = now + 5 * 60 * 1000;
  if (timestamp.getTime() < oneYearAgo || timestamp.getTime() > fiveMinutesFromNow) return null;

  return timestamp.toISOString();
}

function normalizeInferredCheckOutAt(value, activeCheckInAt, nextCheckInAt) {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) return null;

  const inferred = new Date(timestamp);
  const activeStart = new Date(activeCheckInAt);
  const nextStart = new Date(nextCheckInAt);
  if (
    Number.isNaN(inferred.getTime()) ||
    Number.isNaN(activeStart.getTime()) ||
    Number.isNaN(nextStart.getTime()) ||
    inferred <= activeStart ||
    inferred >= nextStart
  ) {
    return null;
  }

  return timestamp;
}

async function findSessionById(pk, sessionId) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :sessionPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: pk },
        ":sessionPrefix": { S: "SESSION#" }
      },
      ScanIndexForward: false,
      Limit: 120
    })
  );

  const session = (result.Items ?? []).map(itemToObject).find((item) => item?.sessionId === sessionId);
  return session ?? null;
}

async function loadState(pk) {
  const settingsResult = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: "SETTINGS" }),
      ProjectionExpression: "#dailyGoalMinutes",
      ExpressionAttributeNames: {
        "#dailyGoalMinutes": "dailyGoalMinutes"
      }
    })
  );
  const activeResult = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: "ACTIVE_SESSION" }),
      ProjectionExpression: "#sessionId, #sessionSk, #checkInAt, #mode, #note",
      ExpressionAttributeNames: {
        "#sessionId": "sessionId",
        "#sessionSk": "sessionSk",
        "#checkInAt": "checkInAt",
        "#mode": "mode",
        "#note": "note"
      }
    })
  );
  const sessionsResult = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :sessionPrefix)",
      ProjectionExpression: "#sessionId, #checkInAt, #checkOutAt, #mode, #note",
      ExpressionAttributeNames: {
        "#sessionId": "sessionId",
        "#checkInAt": "checkInAt",
        "#checkOutAt": "checkOutAt",
        "#mode": "mode",
        "#note": "note"
      },
      ExpressionAttributeValues: {
        ":pk": { S: pk },
        ":sessionPrefix": { S: "SESSION#" }
      },
      ScanIndexForward: false,
      Limit: stateRecentSessionLimit
    })
  );

  const active = itemToObject(activeResult.Item);
  const settings = itemToObject(settingsResult.Item);
  const sessions = (sessionsResult.Items ?? []).map(itemToObject);
  const hasActiveSessionItem = active?.sessionId && sessions.some((session) => session?.sessionId === active.sessionId);

  if (active?.sessionSk && !hasActiveSessionItem) {
    const activeSessionResult = await dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: objectToItem({ pk, sk: active.sessionSk }),
        ProjectionExpression: "#sessionId, #checkInAt, #checkOutAt, #mode, #note",
        ExpressionAttributeNames: {
          "#sessionId": "sessionId",
          "#checkInAt": "checkInAt",
          "#checkOutAt": "checkOutAt",
          "#mode": "mode",
          "#note": "note"
        }
      })
    );
    const activeSession = itemToObject(activeSessionResult.Item);
    if (activeSession) {
      sessions.push(activeSession);
    }
  }

  return {
    records: sortRecordsByTimestampDesc(sessions.flatMap((session) => toRecords(session, active?.sessionId))),
    activeSession: active
      ? {
          id: active.sessionId,
          checkInAt: active.checkInAt,
          mode: active.mode,
          note: active.note
        }
      : null,
    dailyGoalMinutes: Number(settings?.dailyGoalMinutes ?? defaultDailyGoalMinutes)
  };
}

async function updateRecordTime(pk, recordId, body) {
  const parsed = parseRecordId(recordId);
  if (!parsed) {
    return json(400, { error: "Invalid record id." });
  }

  const wantsTimestampUpdate = Object.prototype.hasOwnProperty.call(body, "timestamp");
  const timestamp = wantsTimestampUpdate ? normalizeTimestamp(body.timestamp) : null;
  if (wantsTimestampUpdate && !timestamp) {
    return json(400, { error: "Timestamp must be a valid ISO time within the editable range." });
  }

  const wantsModeUpdate = Object.prototype.hasOwnProperty.call(body, "mode");
  if (wantsModeUpdate && (typeof body.mode !== "string" || !allowedModes.has(body.mode))) {
    return json(400, { error: "Invalid work mode." });
  }

  const wantsNoteUpdate = Object.prototype.hasOwnProperty.call(body, "note");
  const note = wantsNoteUpdate ? String(body.note ?? "").slice(0, 300) : undefined;

  if (!wantsTimestampUpdate && !wantsModeUpdate && !wantsNoteUpdate) {
    return json(400, { error: "At least one record field must be provided." });
  }

  const session = await findSessionById(pk, parsed.sessionId);
  if (!session) {
    return json(404, { error: "Record was not found." });
  }

  const activeResult = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: "ACTIVE_SESSION" })
    })
  );
  const active = itemToObject(activeResult.Item);
  const isActiveSession = active?.sessionId === session.sessionId;
  const updatedAt = new Date().toISOString();
  const nextMode = wantsModeUpdate ? body.mode : session.mode;
  const nextNote = wantsNoteUpdate ? note : session.note;
  const metadataPatch = {
    mode: nextMode,
    note: nextNote,
    updatedAt
  };

  if (parsed.kind === "in") {
    const nextCheckInAt = timestamp ?? session.checkInAt;
    if (session.checkOutAt && new Date(nextCheckInAt).getTime() >= new Date(session.checkOutAt).getTime()) {
      return json(400, { error: "Check-in time must be earlier than check-out time." });
    }

    const nextSk = `SESSION#${nextCheckInAt}#${session.sessionId}`;
    const nextSession = {
      ...session,
      sk: nextSk,
      checkInAt: nextCheckInAt,
      mode: nextMode,
      note: nextNote,
      updatedAt
    };

    if (nextSk === session.sk) {
      const sessionUpdate = updateExpressionFor({
        checkInAt: nextCheckInAt,
        ...metadataPatch
      });
      const transactItems = [
        {
          Update: {
            TableName: tableName,
            Key: objectToItem({ pk, sk: session.sk }),
            ...sessionUpdate,
            ConditionExpression: "attribute_exists(pk)",
          }
        }
      ];

      if (isActiveSession) {
        const activeUpdate = updateExpressionFor({
          checkInAt: nextCheckInAt,
          mode: nextMode,
          note: nextNote,
          updatedAt
        });
        transactItems.push({
          Update: {
            TableName: tableName,
            Key: objectToItem({ pk, sk: "ACTIVE_SESSION" }),
            ...activeUpdate,
            ConditionExpression: "attribute_exists(pk)",
          }
        });
      }

      await dynamodb.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
      return json(200, await loadState(pk));
    }

    const transactItems = [
      {
        Delete: {
          TableName: tableName,
          Key: objectToItem({ pk, sk: session.sk }),
          ConditionExpression: "attribute_exists(pk)"
        }
      },
      {
        Put: {
          TableName: tableName,
          Item: objectToItem(nextSession),
          ConditionExpression: "attribute_not_exists(pk)"
        }
      }
    ];

    if (isActiveSession) {
      transactItems.push({
        Put: {
          TableName: tableName,
          Item: objectToItem({
            ...nextSession,
            sk: "ACTIVE_SESSION",
            sessionSk: nextSk,
            entityType: "ACTIVE_SESSION"
          }),
          ConditionExpression: "attribute_exists(pk)"
        }
      });
    }

    await dynamodb.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
    return json(200, await loadState(pk));
  }

  if (!session.checkOutAt) {
    return json(400, { error: "Check-out time can be edited after check-out is recorded." });
  }

  const nextCheckOutAt = timestamp ?? session.checkOutAt;
  if (new Date(nextCheckOutAt).getTime() <= new Date(session.checkInAt).getTime()) {
    return json(400, { error: "Check-out time must be later than check-in time." });
  }

  const sessionUpdate = updateExpressionFor({
    checkOutAt: nextCheckOutAt,
    ...metadataPatch
  });

  await dynamodb.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName,
            Key: objectToItem({ pk, sk: session.sk }),
            ...sessionUpdate,
            ConditionExpression: "attribute_exists(pk) and attribute_exists(checkOutAt)",
          }
        }
      ]
    })
  );

  return json(200, await loadState(pk));
}

async function deleteRecordSession(pk, recordId) {
  const parsed = parseRecordId(recordId);
  if (!parsed) {
    return json(400, { error: "Invalid record id." });
  }

  const session = await findSessionById(pk, parsed.sessionId);
  if (!session) {
    return json(404, { error: "Record was not found." });
  }

  const activeResult = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: "ACTIVE_SESSION" })
    })
  );
  const active = itemToObject(activeResult.Item);
  const transactItems = [
    {
      Delete: {
        TableName: tableName,
        Key: objectToItem({ pk, sk: session.sk }),
        ConditionExpression: "attribute_exists(pk)"
      }
    }
  ];

  if (active?.sessionId === session.sessionId) {
    transactItems.push({
      Delete: {
        TableName: tableName,
        Key: objectToItem({ pk, sk: "ACTIVE_SESSION" }),
        ConditionExpression: "attribute_exists(pk)"
      }
    });
  }

  try {
    await dynamodb.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (isConditionalFailure(error)) {
      return json(404, { error: "Record was not found." });
    }

    throw error;
  }

  return json(200, await loadState(pk));
}

async function checkIn(pk, body) {
  const mode = body.mode;
  if (typeof mode !== "string" || !allowedModes.has(mode)) {
    return json(400, { error: "Invalid work mode." });
  }

  const active = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: "ACTIVE_SESSION" })
    })
  );

  const activeItem = itemToObject(active.Item);
  const shouldMarkPreviousMissing = body.resolveActiveSession === "mark-missing-check-out";
  if (activeItem && !shouldMarkPreviousMissing) {
    return json(409, { error: "An active session already exists." });
  }

  const now = new Date().toISOString();
  let inferredPreviousCheckOutAt = null;
  if (activeItem && shouldMarkPreviousMissing) {
    const activeCheckInAt = activeItem.checkInAt ? new Date(activeItem.checkInAt) : null;
    if (!activeItem.sessionSk || !activeItem.sessionId || !activeCheckInAt || Number.isNaN(activeCheckInAt.getTime())) {
      return json(409, { error: "The previous active session could not be resolved." });
    }

    if (cacheDateFor(activeCheckInAt) === cacheDateFor(new Date(now))) {
      return json(409, { error: "The active session must be checked out before starting a new session today." });
    }

    inferredPreviousCheckOutAt = normalizeInferredCheckOutAt(body.inferredCheckOutAt, activeCheckInAt, now);
  }

  const sessionId = randomUUID();
  const sessionSk = `SESSION#${now}#${sessionId}`;
  const note = String(body.note ?? "").slice(0, 300);
  const sessionItem = {
    pk,
    sk: sessionSk,
    entityType: "SESSION",
    sessionId,
    mode,
    note,
    checkInAt: now,
    createdAt: now,
    updatedAt: now
  };

  try {
    const transactItems = [];

    if (activeItem && shouldMarkPreviousMissing && inferredPreviousCheckOutAt) {
      transactItems.push({
        Update: {
          TableName: tableName,
          Key: objectToItem({ pk, sk: activeItem.sessionSk }),
          UpdateExpression:
            "set checkOutAt = :checkOutAt, autoCheckOutAt = :checkOutAt, autoCheckOutSource = :source, autoCheckOutResolvedAt = :now, sessionStatus = :completed, updatedAt = :now",
          ConditionExpression: "attribute_exists(pk) and attribute_not_exists(checkOutAt)",
          ExpressionAttributeValues: {
            ":checkOutAt": { S: inferredPreviousCheckOutAt },
            ":source": { S: "client-last-activity" },
            ":now": { S: now },
            ":completed": { S: "completed" }
          }
        }
      });
    } else if (activeItem && shouldMarkPreviousMissing) {
      transactItems.push({
        Update: {
          TableName: tableName,
          Key: objectToItem({ pk, sk: activeItem.sessionSk }),
          UpdateExpression: "set missedCheckOutAt = :now, sessionStatus = :missing, updatedAt = :now",
          ConditionExpression: "attribute_exists(pk) and attribute_not_exists(checkOutAt)",
          ExpressionAttributeValues: {
            ":now": { S: now },
            ":missing": { S: "missing-check-out" }
          }
        }
      });
    }

    transactItems.push({
      Put: {
        TableName: tableName,
        Item: objectToItem(sessionItem),
        ConditionExpression: "attribute_not_exists(pk)"
      }
    });

    if (activeItem && shouldMarkPreviousMissing) {
      transactItems.push({
        Update: {
          TableName: tableName,
          Key: objectToItem({ pk, sk: "ACTIVE_SESSION" }),
          UpdateExpression:
            "set sessionId = :sessionId, sessionSk = :sessionSk, entityType = :entityType, #mode = :mode, note = :note, checkInAt = :checkInAt, createdAt = :createdAt, updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(pk) and sessionId = :previousSessionId",
          ExpressionAttributeNames: {
            "#mode": "mode"
          },
          ExpressionAttributeValues: {
            ":sessionId": { S: sessionId },
            ":sessionSk": { S: sessionSk },
            ":entityType": { S: "ACTIVE_SESSION" },
            ":mode": { S: mode },
            ":note": { S: note },
            ":checkInAt": { S: now },
            ":createdAt": { S: now },
            ":updatedAt": { S: now },
            ":previousSessionId": { S: activeItem.sessionId }
          }
        }
      });
    } else {
      transactItems.push({
        Put: {
          TableName: tableName,
          Item: objectToItem({
            ...sessionItem,
            sk: "ACTIVE_SESSION",
            sessionSk,
            entityType: "ACTIVE_SESSION"
          }),
          ConditionExpression: "attribute_not_exists(pk)"
        }
      });
    }

    await dynamodb.send(new TransactWriteItemsCommand({ TransactItems: transactItems }));
  } catch (error) {
    if (isConditionalFailure(error)) {
      return json(409, { error: "An active session already exists." });
    }

    throw error;
  }

  return json(201, await loadState(pk));
}

async function checkOut(pk) {
  const active = await dynamodb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: objectToItem({ pk, sk: "ACTIVE_SESSION" })
    })
  );

  const activeItem = itemToObject(active.Item);
  if (!activeItem?.sessionSk) {
    return json(409, { error: "There is no active session to check out." });
  }

  const now = new Date().toISOString();
  try {
    await dynamodb.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: tableName,
              Key: objectToItem({ pk, sk: activeItem.sessionSk }),
              UpdateExpression: "set checkOutAt = :now, updatedAt = :now",
              ConditionExpression: "attribute_exists(pk) and attribute_not_exists(checkOutAt)",
              ExpressionAttributeValues: {
                ":now": { S: now }
              }
            }
          },
          {
            Delete: {
              TableName: tableName,
              Key: objectToItem({ pk, sk: "ACTIVE_SESSION" })
            }
          }
        ]
      })
    );
  } catch (error) {
    if (isConditionalFailure(error)) {
      return json(409, { error: "There is no active session to check out." });
    }

    throw error;
  }

  return json(200, await loadState(pk));
}

async function updateSettings(pk, body) {
  const dailyGoalMinutes = Number(body.dailyGoalMinutes);
  if (!Number.isInteger(dailyGoalMinutes) || dailyGoalMinutes < 120 || dailyGoalMinutes > 720) {
    return json(400, { error: "Daily goal must be between 120 and 720 minutes." });
  }

  const now = new Date().toISOString();
  await dynamodb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: objectToItem({
        pk,
        sk: "SETTINGS",
        entityType: "SETTINGS",
        dailyGoalMinutes,
        updatedAt: now
      })
    })
  );

  return json(200, await loadState(pk));
}

export async function handler(event) {
  try {
    if (event?.pineflowTask) {
      return handleTrendLensSchedule(event);
    }

    const method = event.requestContext?.http?.method ?? "GET";
    const path = event.rawPath ?? "";

    const pk = getUserPartitionKey(event);
    if (!pk) {
      return json(401, { error: "Cognito JWT is required." });
    }

    if (method === "GET" && path === "/api/health") {
      return json(200, { ok: true, service: "pineflow-api" });
    }
    if (method === "GET" && path === "/api/usage") {
      return json(200, await loadUsageSnapshot(pk));
    }
    if (method === "GET" && path === "/api/trend-lens") {
      return json(200, (await loadTrendLensSnapshot()) ?? trendLensPlaceholderSnapshot());
    }

    const body = parseBody(event);
    if (!body.ok) {
      return json(400, { error: body.error });
    }

    if (method === "GET" && path === "/api/state") return json(200, await loadState(pk));
    if (method === "POST" && path === "/api/check-in") return checkIn(pk, body.value);
    if (method === "POST" && path === "/api/check-out") return checkOut(pk);
    if (method === "POST" && path === "/api/trend-lens/refresh") {
      const scope = body.value.scope === "security" || body.value.scope === "academic" ? body.value.scope : "all";
      return refreshTrendLensSnapshot(scope, "manual", {
        force: Boolean(body.value.force),
        reset: Boolean(body.value.reset)
      });
    }
    if (method === "PATCH" && path.startsWith("/api/records/")) {
      const recordId = recordIdFromPath(path);
      if (!recordId) return json(400, { error: "Invalid record id." });
      return updateRecordTime(pk, recordId, body.value);
    }
    if (method === "DELETE" && path.startsWith("/api/records/")) {
      const recordId = recordIdFromPath(path);
      if (!recordId) return json(400, { error: "Invalid record id." });
      return deleteRecordSession(pk, recordId);
    }
    if (method === "PATCH" && path === "/api/settings") return updateSettings(pk, body.value);

    return json(404, { error: "Not found." });
  } catch (error) {
    if (isThroughputLimited(error)) {
      console.warn("Pineflow API capacity guardrail limited a request", { name: error?.name });
      return json(429, { error: "요청이 잠시 몰려 기록 데이터를 바로 읽지 못했습니다. 잠시 후 다시 시도해주세요." });
    }

    console.error("Unhandled Pineflow API error", { name: error?.name, message: error?.message });
    return json(500, { error: "Unexpected server error." });
  }
}
