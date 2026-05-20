import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ensureSettings, migrate, pool } from "./db.mjs";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3001);
const defaultOwnerKey = process.env.PINEFLOW_OWNER_KEY ?? "default-user";

app.use(cors());
app.use(express.json());

function ownerKeyFor(request) {
  return request.header("x-owner-key") || defaultOwnerKey;
}

function toState(rows, dailyGoalMinutes) {
  const records = rows.flatMap((session) => {
    const checkIn = {
      id: `${session.id}:in`,
      type: "check-in",
      timestamp: session.check_in_at,
      mode: session.mode,
      note: session.note,
    };

    if (!session.check_out_at) return [checkIn];

    return [
      {
        id: `${session.id}:out`,
        type: "check-out",
        timestamp: session.check_out_at,
        mode: session.mode,
        note: session.note,
      },
      checkIn,
    ];
  });

  const active = rows.find((session) => !session.check_out_at);

  return {
    records,
    activeSession: active
      ? {
          id: active.id,
          checkInAt: active.check_in_at,
          mode: active.mode,
          note: active.note,
        }
      : null,
    dailyGoalMinutes,
  };
}

async function loadState(ownerKey) {
  const settings = await ensureSettings(ownerKey);
  const sessions = await pool.query(
    `
      select
        id::text,
        mode,
        note,
        check_in_at,
        check_out_at
      from work_sessions
      where owner_key = $1
      order by check_in_at desc
      limit 80
    `,
    [ownerKey],
  );

  return toState(sessions.rows, settings.daily_goal_minutes);
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "pineflow-api" });
});

app.get("/api/state", async (request, response, next) => {
  try {
    response.json(await loadState(ownerKeyFor(request)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/check-in", async (request, response, next) => {
  try {
    const ownerKey = ownerKeyFor(request);
    const mode = request.body?.mode;
    const note = String(request.body?.note ?? "").slice(0, 300);

    if (!["focus", "remote", "study", "project"].includes(mode)) {
      response.status(400).json({ error: "Invalid work mode." });
      return;
    }

    const active = await pool.query(
      "select id from work_sessions where owner_key = $1 and check_out_at is null limit 1",
      [ownerKey],
    );

    if (active.rowCount > 0) {
      response.status(409).json({ error: "An active session already exists." });
      return;
    }

    await pool.query(
      `
        insert into work_sessions (id, owner_key, mode, note, check_in_at)
        values ($1, $2, $3, $4, now())
      `,
      [crypto.randomUUID(), ownerKey, mode, note],
    );

    response.status(201).json(await loadState(ownerKey));
  } catch (error) {
    next(error);
  }
});

app.post("/api/check-out", async (request, response, next) => {
  try {
    const ownerKey = ownerKeyFor(request);
    const result = await pool.query(
      `
        update work_sessions
        set check_out_at = now(), updated_at = now()
        where id = (
          select id
          from work_sessions
          where owner_key = $1 and check_out_at is null
          order by check_in_at desc
          limit 1
        )
      `,
      [ownerKey],
    );

    if (result.rowCount === 0) {
      response.status(409).json({ error: "There is no active session to check out." });
      return;
    }

    response.json(await loadState(ownerKey));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/settings", async (request, response, next) => {
  try {
    const ownerKey = ownerKeyFor(request);
    const dailyGoalMinutes = Number(request.body?.dailyGoalMinutes);

    if (!Number.isInteger(dailyGoalMinutes) || dailyGoalMinutes < 120 || dailyGoalMinutes > 720) {
      response.status(400).json({ error: "Daily goal must be between 120 and 720 minutes." });
      return;
    }

    await pool.query(
      `
        insert into user_settings (owner_key, daily_goal_minutes)
        values ($1, $2)
        on conflict (owner_key) do update
          set daily_goal_minutes = excluded.daily_goal_minutes,
              updated_at = now()
      `,
      [ownerKey, dailyGoalMinutes],
    );

    response.json(await loadState(ownerKey));
  } catch (error) {
    next(error);
  }
});

const distPath = join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api")) {
      next();
      return;
    }

    response.sendFile(join(distPath, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Unexpected server error." });
});

await migrate();
app.listen(port, "0.0.0.0", () => {
  console.log(`Pineflow API listening on ${port}`);
});
