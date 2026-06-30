#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const backupFormat = "pineflow.dynamodb-backup.v1";
const defaultTableName = process.env.PINEFLOW_DDB_TABLE ?? process.env.TABLE_NAME ?? "pineflow";
const defaultRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-northeast-2";
const defaultPageSize = 25;
const defaultDelayMs = 1200;
const defaultMaxRetries = 8;

function usage() {
  console.log(`Pineflow DynamoDB backup helper

Usage:
  node scripts/dynamodb-backup.mjs export --out <backup.json> [--table pineflow]
  node scripts/dynamodb-backup.mjs validate --file <backup.json>
  node scripts/dynamodb-backup.mjs import --file <backup.json> [--table pineflow] [--dry-run]
  node scripts/dynamodb-backup.mjs self-test

Options:
  --table <name>       DynamoDB table name. Default: ${defaultTableName}
  --region <name>      AWS region. Default: ${defaultRegion}
  --profile <name>     AWS CLI profile.
  --out <path>         Export output path.
  --file <path>        Backup file for validate/import.
  --page-size <n>      Scan page size for export. Default: ${defaultPageSize}
  --delay-ms <n>       Delay between scan pages or writes. Default: ${defaultDelayMs}
  --max-retries <n>    Retry count for throttled AWS CLI calls. Default: ${defaultMaxRetries}
  --consistent-read    Use strongly consistent DynamoDB scan reads.
  --overwrite          Import may overwrite existing items. Dangerous; off by default.
  --skip-existing      Import skips conditional collisions instead of failing.
  --skip-derived       Import skips derived cache items such as Trend Lens and usage cache.
  --dry-run            Validate and print the import plan without writing.

The helper shells out to AWS CLI v2 and stores raw DynamoDB AttributeValue JSON.
It does not create AWS resources and keeps imports conservative by default.`);
}

function parseArgs(argv) {
  const command = argv[2] ?? "help";
  const options = {
    table: defaultTableName,
    region: defaultRegion,
    pageSize: defaultPageSize,
    delayMs: defaultDelayMs,
    maxRetries: defaultMaxRetries,
    consistentRead: false,
    overwrite: false,
    skipExisting: false,
    skipDerived: false,
    dryRun: false
  };

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };

    if (arg === "--table") options.table = readValue();
    else if (arg === "--region") options.region = readValue();
    else if (arg === "--profile") options.profile = readValue();
    else if (arg === "--out") options.out = readValue();
    else if (arg === "--file") options.file = readValue();
    else if (arg === "--page-size") options.pageSize = parsePositiveInteger(readValue(), "page-size");
    else if (arg === "--delay-ms") options.delayMs = parseNonNegativeInteger(readValue(), "delay-ms");
    else if (arg === "--max-retries") options.maxRetries = parseNonNegativeInteger(readValue(), "max-retries");
    else if (arg === "--consistent-read") options.consistentRead = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--skip-existing") options.skipExisting = true;
    else if (arg === "--skip-derived") options.skipDerived = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (options.overwrite && options.skipExisting) {
    throw new Error("--overwrite and --skip-existing cannot be used together.");
  }

  return { command, options };
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function awsCommandName() {
  return process.platform === "win32" ? "aws.cmd" : "aws";
}

function awsBaseArgs(options) {
  const args = [];
  if (options.region) args.push("--region", options.region);
  if (options.profile) args.push("--profile", options.profile);
  return args;
}

function fileUri(path) {
  const normalized = path.replace(/\\/g, "/");
  return `file://${normalized}`;
}

function runAws(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(awsCommandName(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Failed to start AWS CLI. Install AWS CLI v2 and configure credentials. ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim() ? JSON.parse(stdout) : {});
        return;
      }

      const error = new Error(stderr.trim() || `AWS CLI exited with code ${code}.`);
      error.stderr = stderr;
      error.exitCode = code;
      reject(error);
    });
  });
}

function isRetryableAwsError(error) {
  const text = `${error?.message ?? ""}\n${error?.stderr ?? ""}`;
  return [
    "ProvisionedThroughputExceededException",
    "ThrottlingException",
    "TooManyRequestsException",
    "RequestLimitExceeded",
    "InternalServerError",
    "ServiceUnavailable"
  ].some((marker) => text.includes(marker));
}

function isConditionalFailure(error) {
  const text = `${error?.message ?? ""}\n${error?.stderr ?? ""}`;
  return text.includes("ConditionalCheckFailedException");
}

async function runAwsWithRetry(args, options) {
  let attempt = 0;
  while (true) {
    try {
      return await runAws(args);
    } catch (error) {
      if (!isRetryableAwsError(error) || attempt >= options.maxRetries) {
        throw error;
      }
      const waitMs = options.delayMs * Math.max(1, attempt + 1);
      console.warn(`AWS CLI call throttled; retrying in ${waitMs}ms (${attempt + 1}/${options.maxRetries}).`);
      await sleep(waitMs);
      attempt += 1;
    }
  }
}

function tempJsonFile(tmpDir, name, value) {
  const path = join(tmpDir, name);
  writeFileSync(path, JSON.stringify(value), "utf8");
  return path;
}

async function exportBackup(options) {
  if (!options.out) {
    throw new Error("export requires --out <backup.json>.");
  }

  const outDir = dirname(options.out);
  if (outDir && outDir !== ".") mkdirSync(outDir, { recursive: true });

  const tmpDir = mkdtempSync(join(tmpdir(), "pineflow-ddb-export-"));
  const items = [];
  let lastEvaluatedKey;
  let page = 0;
  let consumedCapacity = 0;

  try {
    do {
      const args = [
        ...awsBaseArgs(options),
        "dynamodb",
        "scan",
        "--table-name",
        options.table,
        "--no-paginate",
        "--limit",
        String(options.pageSize),
        "--return-consumed-capacity",
        "TOTAL",
        "--output",
        "json"
      ];

      if (options.consistentRead) args.push("--consistent-read");
      if (lastEvaluatedKey) {
        const keyPath = tempJsonFile(tmpDir, "exclusive-start-key.json", lastEvaluatedKey);
        args.push("--exclusive-start-key", fileUri(keyPath));
      }

      const result = await runAwsWithRetry(args, options);
      page += 1;
      items.push(...(result.Items ?? []));
      consumedCapacity += Number(result.ConsumedCapacity?.CapacityUnits ?? 0);
      lastEvaluatedKey = result.LastEvaluatedKey;
      console.log(`Scanned page ${page}; accumulated ${items.length} items.`);

      if (lastEvaluatedKey && options.delayMs > 0) await sleep(options.delayMs);
    } while (lastEvaluatedKey);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const payload = {
    format: backupFormat,
    tableName: options.table,
    exportedAt: new Date().toISOString(),
    region: options.region,
    consistentRead: options.consistentRead,
    itemCount: items.length,
    consumedCapacity,
    items
  };

  const validation = validateBackupPayload(payload);
  printValidation(validation);
  if (validation.errors.length > 0) {
    throw new Error("Exported backup failed validation; file was not written.");
  }

  writeFileSync(options.out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${items.length} DynamoDB items to ${options.out}.`);
}

async function importBackup(options) {
  if (!options.file) {
    throw new Error("import requires --file <backup.json>.");
  }

  const payload = readBackupFile(options.file);
  const validation = validateBackupPayload(payload);
  printValidation(validation);
  if (validation.errors.length > 0) {
    throw new Error("Backup validation failed; import stopped before writing.");
  }

  const items = options.skipDerived ? payload.items.filter((item) => !isDerivedItem(item)) : payload.items;
  if (options.dryRun) {
    console.log(`Dry run: ${items.length} items would be imported into ${options.table}.`);
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "pineflow-ddb-import-"));
  let imported = 0;
  let skipped = 0;

  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const itemPath = tempJsonFile(tmpDir, "item.json", item);
      const args = [
        ...awsBaseArgs(options),
        "dynamodb",
        "put-item",
        "--table-name",
        options.table,
        "--item",
        fileUri(itemPath),
        "--return-consumed-capacity",
        "TOTAL",
        "--output",
        "json"
      ];

      if (!options.overwrite) {
        args.push("--condition-expression", "attribute_not_exists(pk) AND attribute_not_exists(sk)");
      }

      try {
        await runAwsWithRetry(args, options);
        imported += 1;
      } catch (error) {
        if (options.skipExisting && isConditionalFailure(error)) {
          skipped += 1;
          console.warn(`Skipped existing item ${keyLabel(item)}.`);
        } else {
          throw error;
        }
      }

      if (options.delayMs > 0 && index < items.length - 1) await sleep(options.delayMs);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`Imported ${imported} items into ${options.table}. Skipped ${skipped}.`);
}

function validateCommand(options) {
  if (!options.file) {
    throw new Error("validate requires --file <backup.json>.");
  }

  const payload = readBackupFile(options.file);
  const validation = validateBackupPayload(payload);
  printValidation(validation);
  if (validation.errors.length > 0) {
    process.exitCode = 1;
  }
}

function readBackupFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Backup file not found: ${path}`);
  }
  const payload = JSON.parse(readFileSync(path, "utf8"));
  return payload;
}

function keyLabel(item) {
  return `${attributeString(item, "pk") ?? "<missing-pk>"} / ${attributeString(item, "sk") ?? "<missing-sk>"}`;
}

function attributeString(item, name) {
  const value = item?.[name];
  return value && typeof value.S === "string" ? value.S : undefined;
}

function attributeNumber(item, name) {
  const value = item?.[name];
  return value && typeof value.N === "string" ? Number(value.N) : undefined;
}

function isAttributeValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1) return false;
  return ["S", "N", "B", "BOOL", "NULL", "M", "L", "SS", "NS", "BS"].includes(keys[0]);
}

function isIsoString(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isDerivedItem(item) {
  const pk = attributeString(item, "pk");
  const sk = attributeString(item, "sk") ?? "";
  return pk === "SYSTEM#TREND_LENS" || sk.startsWith("USAGE#");
}

function validateBackupPayload(payload) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const byKey = new Map();
  const userPartitions = new Map();

  if (payload?.format !== backupFormat) {
    errors.push(`Unsupported backup format: ${payload?.format ?? "<missing>"}.`);
  }
  if (!Array.isArray(payload?.items)) {
    errors.push("Backup must contain an items array.");
    return { errors, warnings, stats: { itemCount: 0, userCount: 0, sessionCount: 0, derivedCount: 0 } };
  }
  if (payload.itemCount !== undefined && payload.itemCount !== payload.items.length) {
    warnings.push(`itemCount metadata is ${payload.itemCount}, but file contains ${payload.items.length} items.`);
  }

  let sessionCount = 0;
  let derivedCount = 0;

  for (const [index, item] of payload.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`Item ${index} must be a DynamoDB item object.`);
      continue;
    }

    for (const [name, value] of Object.entries(item)) {
      if (!isAttributeValue(value)) {
        errors.push(`Item ${index} attribute ${name} is not valid AttributeValue JSON.`);
      }
    }

    const pk = attributeString(item, "pk");
    const sk = attributeString(item, "sk");
    if (!pk || !sk) {
      errors.push(`Item ${index} is missing string pk/sk.`);
      continue;
    }

    const key = `${pk}\u0000${sk}`;
    if (seen.has(key)) errors.push(`Duplicate item key: ${pk} / ${sk}.`);
    seen.add(key);
    byKey.set(key, item);

    if (pk.startsWith("USER#")) {
      if (!userPartitions.has(pk)) userPartitions.set(pk, []);
      userPartitions.get(pk).push(item);
    }
    if (sk.startsWith("SESSION#")) sessionCount += 1;
    if (isDerivedItem(item)) derivedCount += 1;

    validateKnownItemShape(item, errors, warnings);
  }

  for (const [pk, items] of userPartitions.entries()) {
    const activeItems = items.filter((item) => attributeString(item, "sk") === "ACTIVE_SESSION");
    if (activeItems.length > 1) errors.push(`${pk} has more than one ACTIVE_SESSION item.`);
    const active = activeItems[0];
    if (!active) continue;

    const sessionSk = attributeString(active, "sessionSk");
    const sessionId = attributeString(active, "sessionId");
    if (!sessionSk || !sessionId) {
      errors.push(`${pk} ACTIVE_SESSION must include sessionId and sessionSk.`);
      continue;
    }

    const referenced = byKey.get(`${pk}\u0000${sessionSk}`);
    if (!referenced) {
      errors.push(`${pk} ACTIVE_SESSION points to missing session item ${sessionSk}.`);
      continue;
    }
    if (attributeString(referenced, "sessionId") !== sessionId) {
      errors.push(`${pk} ACTIVE_SESSION sessionId does not match referenced ${sessionSk}.`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      itemCount: payload.items.length,
      userCount: userPartitions.size,
      sessionCount,
      derivedCount
    }
  };
}

function validateKnownItemShape(item, errors, warnings) {
  const pk = attributeString(item, "pk");
  const sk = attributeString(item, "sk");
  const entityType = attributeString(item, "entityType");

  if (sk === "SETTINGS") {
    if (entityType && entityType !== "SETTINGS") warnings.push(`${pk} SETTINGS has unexpected entityType ${entityType}.`);
    const dailyGoalMinutes = attributeNumber(item, "dailyGoalMinutes");
    if (dailyGoalMinutes !== undefined && (!Number.isInteger(dailyGoalMinutes) || dailyGoalMinutes < 120 || dailyGoalMinutes > 720)) {
      warnings.push(`${pk} SETTINGS dailyGoalMinutes is outside the expected editable range.`);
    }
    return;
  }

  if (sk === "ACTIVE_SESSION") {
    if (entityType && entityType !== "ACTIVE_SESSION") warnings.push(`${pk} ACTIVE_SESSION has unexpected entityType ${entityType}.`);
    const checkInAt = attributeString(item, "checkInAt");
    if (!isIsoString(checkInAt)) errors.push(`${pk} ACTIVE_SESSION checkInAt must be an ISO timestamp.`);
    return;
  }

  if (sk?.startsWith("SESSION#")) {
    if (entityType && entityType !== "SESSION") warnings.push(`${pk} ${sk} has unexpected entityType ${entityType}.`);
    const sessionId = attributeString(item, "sessionId");
    const checkInAt = attributeString(item, "checkInAt");
    const checkOutAt = attributeString(item, "checkOutAt");
    if (!sessionId) errors.push(`${pk} ${sk} is missing sessionId.`);
    if (!isIsoString(checkInAt)) errors.push(`${pk} ${sk} checkInAt must be an ISO timestamp.`);
    if (checkOutAt && !isIsoString(checkOutAt)) errors.push(`${pk} ${sk} checkOutAt must be an ISO timestamp.`);
    if (sessionId && checkInAt && sk !== `SESSION#${checkInAt}#${sessionId}`) {
      errors.push(`${pk} ${sk} does not match SESSION#<checkInAt>#<sessionId>.`);
    }
  }
}

function printValidation(validation) {
  const { stats, warnings, errors } = validation;
  console.log(
    `Validated ${stats.itemCount} items (${stats.userCount} user partitions, ${stats.sessionCount} sessions, ${stats.derivedCount} derived cache items).`
  );
  for (const warning of warnings) console.warn(`Warning: ${warning}`);
  for (const error of errors) console.error(`Error: ${error}`);
}

function selfTest() {
  const validPayload = {
    format: backupFormat,
    itemCount: 3,
    items: [
      {
        pk: { S: "USER#abc" },
        sk: { S: "SETTINGS" },
        entityType: { S: "SETTINGS" },
        dailyGoalMinutes: { N: "480" }
      },
      {
        pk: { S: "USER#abc" },
        sk: { S: "SESSION#2026-06-18T00:00:00.000Z#session-1" },
        entityType: { S: "SESSION" },
        sessionId: { S: "session-1" },
        checkInAt: { S: "2026-06-18T00:00:00.000Z" },
        mode: { S: "focus" },
        note: { S: "" }
      },
      {
        pk: { S: "USER#abc" },
        sk: { S: "ACTIVE_SESSION" },
        entityType: { S: "ACTIVE_SESSION" },
        sessionId: { S: "session-1" },
        sessionSk: { S: "SESSION#2026-06-18T00:00:00.000Z#session-1" },
        checkInAt: { S: "2026-06-18T00:00:00.000Z" }
      }
    ]
  };
  const valid = validateBackupPayload(validPayload);
  assert.equal(valid.errors.length, 0);
  assert.equal(valid.stats.sessionCount, 1);

  const invalidPayload = {
    ...validPayload,
    items: validPayload.items.filter((item) => attributeString(item, "sk") !== "SESSION#2026-06-18T00:00:00.000Z#session-1")
  };
  const invalid = validateBackupPayload(invalidPayload);
  assert.ok(invalid.errors.some((error) => error.includes("points to missing session item")));

  console.log("Self-test passed.");
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  if (options.help || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  if (command === "export") await exportBackup(options);
  else if (command === "import") await importBackup(options);
  else if (command === "validate") validateCommand(options);
  else if (command === "self-test") selfTest();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
