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
      "content-type": "application/json",
      "access-control-allow-origin": "*"
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

function parseRecordId(recordId) {
  if (typeof recordId !== "string") return null;

  const match = recordId.match(/^(.+):(in|out)$/);
  if (!match) return null;

  return { sessionId: match[1], kind: match[2] };
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

    const body = parseBody(event);
    if (!body.ok) {
      return json(400, { error: body.error });
    }

    if (method === "GET" && path === "/api/state") return json(200, await loadState(pk));
    if (method === "POST" && path === "/api/check-in") return checkIn(pk, body.value);
    if (method === "POST" && path === "/api/check-out") return checkOut(pk);
    if (method === "PATCH" && path.startsWith("/api/records/")) {
      const recordId = decodeURIComponent(path.slice("/api/records/".length));
      return updateRecordTime(pk, recordId, body.value);
    }
    if (method === "DELETE" && path.startsWith("/api/records/")) {
      const recordId = decodeURIComponent(path.slice("/api/records/".length));
      return deleteRecordSession(pk, recordId);
    }
    if (method === "PATCH" && path === "/api/settings") return updateSettings(pk, body.value);

    return json(404, { error: "Not found." });
  } catch (error) {
    console.error("Unhandled Pineflow API error", { name: error?.name });
    return json(500, { error: "Unexpected server error." });
  }
}
