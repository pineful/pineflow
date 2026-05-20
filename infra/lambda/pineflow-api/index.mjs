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
const allowedModes = new Set(["focus", "remote", "study", "project"]);
const defaultDailyGoalMinutes = 480;
const maxBodyBytes = 4096;

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
    records: sessions.flatMap(toRecords),
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

    const body = parseBody(event);
    if (!body.ok) {
      return json(400, { error: body.error });
    }

    if (method === "GET" && path === "/api/state") return json(200, await loadState(pk));
    if (method === "POST" && path === "/api/check-in") return checkIn(pk, body.value);
    if (method === "POST" && path === "/api/check-out") return checkOut(pk);
    if (method === "PATCH" && path === "/api/settings") return updateSettings(pk, body.value);

    return json(404, { error: "Not found." });
  } catch (error) {
    console.error("Unhandled Pineflow API error", { name: error?.name });
    return json(500, { error: "Unexpected server error." });
  }
}
