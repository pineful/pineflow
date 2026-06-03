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
