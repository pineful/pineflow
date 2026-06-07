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

function toRecords(session) {
  const checkIn = {
    id: `${session.sessionId}:in`,
    type: "check-in",
    timestamp: session.checkInAt,
    mode: session.mode,
    note: session.note
  };

  if (!session.checkOutAt) return [checkIn];

  return [
    {
      id: `${session.sessionId}:out`,
      type: "check-out",
      timestamp: session.checkOutAt,
      mode: session.mode,
      note: session.note
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
const trendLensDefaultResponseLimitBytes = 512 * 1024;
const trendLensSourceTimeoutMs = 2200;
const trendLensLargeSourceTimeoutMs = 4500;
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
  security: 5 * 60 * 1000
};
const trendLensForcedCooldownMs = {
  all: 5 * 60 * 1000,
  security: 60 * 1000
};

const trendLensSections = [
  {
    id: "security",
    title: "긴급 보안 신호",
    subtitle: "한국 우선, 실제 악용과 공식 경보를 먼저 봅니다.",
    focus: "KISA, CISA KEV 같은 공식 위험 신호를 우선합니다."
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
  wikimedia: {
    id: "wikimedia-pageviews",
    label: "Wikimedia Pageviews",
    host: "wikimedia.org",
    pathPrefix: "/api/rest_v1/metrics/pageviews/per-article/",
    accept: "application/json"
  },
  googleTrendsPlanned: {
    id: "google-trends",
    label: "Google Trends"
  }
};

const pageviewTopics = {
  mandolin: [
    { project: "en.wikipedia.org", title: "Mandolin", label: "Mandolin", region: "global" },
    { project: "en.wikipedia.org", title: "Avi_Avital", label: "Avi Avital", region: "global" },
    { project: "en.wikipedia.org", title: "Chris_Thile", label: "Chris Thile", region: "global" },
    { project: "en.wikipedia.org", title: "Classical_mandolin", label: "Classical mandolin", region: "global" }
  ],
  "it-content": [
    { project: "en.wikipedia.org", title: "Cybersecurity", label: "Cybersecurity", region: "global" },
    { project: "en.wikipedia.org", title: "Artificial_intelligence", label: "Artificial intelligence", region: "global" },
    { project: "en.wikipedia.org", title: "GitHub_Actions", label: "GitHub Actions", region: "global" }
  ],
  education: [
    { project: "en.wikipedia.org", title: "Educational_technology", label: "Educational technology", region: "global" },
    { project: "en.wikipedia.org", title: "Artificial_intelligence_in_education", label: "AI in education", region: "global" },
    { project: "en.wikipedia.org", title: "Online_learning", label: "Online learning", region: "global" }
  ]
};

function trendLensSnapshotKey(date) {
  return `TREND_LENS#SNAPSHOT#${date}`;
}

function trendManualKey(scope) {
  return `${trendLensManualPrefix}${scope}`;
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
      publishedAt: rssTagValue(item, "pubDate")
    };
  });
}

function kisaPriority(title) {
  if (/긴급|주의|위험|악용|랜섬|침해|보안 업데이트/.test(title)) return "urgent";
  if (/취약점|패치|권고|공지/.test(title)) return "high";
  return "watch";
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
      return {
        id: `cisa-kev-${item.cveID}`,
        category: "security",
        priority: ageHours <= 72 ? "urgent" : "high",
        title: `${item.cveID} 실제 악용 확인`,
        summary: `${item.vendorProject ?? "공급사 미상"} ${item.product ?? "제품"} 취약점이 CISA KEV에 등록되었습니다. 한국 환경 영향 여부를 먼저 확인해야 합니다.`,
        sourceName: "CISA KEV",
        sourceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
        publishedAt: dateAdded.toISOString(),
        region: "global",
        language: "en",
        reasonTags: ["공식", "실제 악용", item.knownRansomwareCampaignUse === "Known" ? "랜섬웨어 연관" : "패치 점검"]
      };
    })
  };
}

function wikimediaDate(date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}00`;
}

function pageviewUrl(topic, start, end) {
  const encodedTitle = encodeURIComponent(topic.title);
  return `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${topic.project}/all-access/user/${encodedTitle}/daily/${wikimediaDate(start)}/${wikimediaDate(end)}`;
}

function trendDeltaLabel(deltaPercent) {
  if (!Number.isFinite(deltaPercent)) return "비교 기준 없음";
  if (deltaPercent > 0) return `이전 7일 대비 ${Math.round(deltaPercent)}% 증가`;
  if (deltaPercent < 0) return `이전 7일 대비 ${Math.abs(Math.round(deltaPercent))}% 감소`;
  return "이전 7일과 비슷함";
}

async function collectPageviewTopic(category, topic, now) {
  const end = plusDays(now, -1);
  const start = plusDays(end, -13);
  const url = pageviewUrl(topic, start, end);
  const text = await fetchTrendLensSource(trendLensSources.wikimedia, url);
  const data = safeParseJson(text);
  const views = Array.isArray(data?.items) ? data.items.map((item) => Number(item.views ?? 0)) : [];
  const previous = views.slice(0, 7).reduce((sum, value) => sum + value, 0);
  const recent = views.slice(7).reduce((sum, value) => sum + value, 0);
  const deltaPercent = previous > 0 ? ((recent - previous) / previous) * 100 : Number.NaN;
  const priority = deltaPercent >= 45 ? "high" : deltaPercent >= 15 ? "watch" : "note";

  return {
    id: `pageview-${category}-${topic.title}`,
    category,
    priority,
    title: topic.label,
    summary: `${trendDeltaLabel(deltaPercent)}입니다. 최근 7일 조회 ${Math.round(recent).toLocaleString("ko-KR")}회를 콘텐츠/학습 주제 관심도의 보조 지표로 봅니다.`,
    sourceName: "Wikimedia Pageviews",
    sourceUrl: `https://${topic.project}/wiki/${encodeURIComponent(topic.title)}`,
    publishedAt: now.toISOString(),
    region: topic.region,
    language: topic.project.startsWith("ko.") ? "ko" : "en",
    reasonTags: ["관심도 보조", "7일 추이", priority === "high" ? "상승" : "관찰"]
  };
}

async function collectPageviewSection(category, now) {
  const topics = pageviewTopics[category] ?? [];
  const results = await Promise.allSettled(topics.map((topic) => collectPageviewTopic(category, topic, now)));
  const items = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))
    .slice(0, 4);
  const failures = results.filter((result) => result.status === "rejected").length;
  return {
    status: sourceStatus(
      trendLensSources.wikimedia,
      items.length > 0 && failures === 0 ? "ready" : items.length > 0 ? "partial" : "unavailable",
      now.toISOString(),
      `${category} 주제 ${items.length}개를 조회했습니다.${failures ? ` 실패 ${failures}개가 있습니다.` : ""}`
    ),
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
      "Google Trends 공식 API는 alpha 성격이 있어 v1은 공개/무키 지표와 수동 리서치 근거를 우선합니다."
    )
  ];
  const updates = [];

  const securityResults = await Promise.allSettled([
    collectKisaRss(trendLensSources.kisaSecurityNotice, now),
    collectKisaRss(trendLensSources.kisaVulnerability, now),
    collectCisaKev(now)
  ]);
  const securitySources = [trendLensSources.kisaSecurityNotice, trendLensSources.kisaVulnerability, trendLensSources.cisaKev];
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
    items: dedupeItems(securityItems)
      .sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))
      .slice(0, 8)
  });

  if (scope === "all") {
    const categories = ["mandolin", "it-content", "education"];
    const sectionResults = await Promise.allSettled(categories.map((category) => collectPageviewSection(category, now)));
    sectionResults.forEach((result, index) => {
      const category = categories[index];
      if (result.status === "fulfilled") {
        statuses.push(result.value.status);
        updates.push({ ...trendSectionBase(category), items: result.value.items });
      } else {
        statuses.push(sourceStatus(trendLensSources.wikimedia, "unavailable", now.toISOString(), `${category} 관심도 지표를 불러오지 못했습니다.`));
      }
    });
  }

  const sections = mergeTrendSections(scope === "security" ? previousSnapshot?.sections : emptyTrendSections(), updates);
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
      plannedSourceStatus(trendLensSources.googleTrendsPlanned, now.toISOString(), "공식 Google Trends API 사용 가능성을 검토 중입니다.")
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

async function refreshTrendLensSnapshot(scope = "all", source = "manual", options = {}) {
  const normalizedScope = scope === "security" ? "security" : "all";
  const now = new Date();

  if (source === "manual") {
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

  const previousSnapshot = await loadTrendLensSnapshot();
  const snapshot = await buildTrendLensSnapshot(normalizedScope, previousSnapshot);
  await saveTrendLensSnapshot(snapshot);

  if (source === "manual") {
    await saveTrendManualGuard(normalizedScope, now);
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
  const [settingsResult, activeResult, sessionsResult] = await Promise.all([
    dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: objectToItem({ pk, sk: "SETTINGS" })
      })
    ),
    dynamodb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: objectToItem({ pk, sk: "ACTIVE_SESSION" })
      })
    ),
    dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk and begins_with(sk, :sessionPrefix)",
        ExpressionAttributeValues: {
          ":pk": { S: pk },
          ":sessionPrefix": { S: "SESSION#" }
        },
        ScanIndexForward: false,
        Limit: 80
      })
    )
  ]);

  const active = itemToObject(activeResult.Item);
  const settings = itemToObject(settingsResult.Item);
  const sessions = (sessionsResult.Items ?? []).map(itemToObject);

  return {
    records: sortRecordsByTimestampDesc(sessions.flatMap(toRecords)),
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

  if (active.Item) {
    return json(409, { error: "An active session already exists." });
  }

  const now = new Date().toISOString();
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
    await dynamodb.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: objectToItem(sessionItem),
              ConditionExpression: "attribute_not_exists(pk)"
            }
          },
          {
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
          }
        ]
      })
    );
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
      const scope = body.value.scope === "security" ? "security" : "all";
      return refreshTrendLensSnapshot(scope, "manual", { force: Boolean(body.value.force) });
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
    console.error("Unhandled Pineflow API error", { name: error?.name, message: error?.message });
    return json(500, { error: "Unexpected server error." });
  }
}
