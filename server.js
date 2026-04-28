import express from "express";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const PLAN_ID = process.env.PLAN_ID || "grotteaux-2026";
const PLAN_PASSWORD = process.env.PLAN_PASSWORD || "grotteaux2026";
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json({ limit: "25mb" }));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    })
  : null;

async function ensureDb() {
  if (!pool) return;
  await pool.query(`
    create table if not exists wedding_plan (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

function requirePassword(req, res, next) {
  const provided = req.get("x-plan-password") || "";
  if (provided !== PLAN_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, database: Boolean(pool) });
});

app.get("/api/plan", requirePassword, async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "database_not_configured" });
  await ensureDb();
  const result = await pool.query("select data, updated_at from wedding_plan where id = $1", [PLAN_ID]);
  if (!result.rowCount) return res.json({ data: null, updatedAt: null });
  res.json({ data: result.rows[0].data, updatedAt: result.rows[0].updated_at });
});

app.put("/api/plan", requirePassword, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database_not_configured" });
  if (!req.body || typeof req.body !== "object" || !req.body.data) {
    return res.status(400).json({ error: "missing_data" });
  }
  await ensureDb();
  const result = await pool.query(
    `insert into wedding_plan (id, data, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()
     returning updated_at`,
    [PLAN_ID, JSON.stringify(req.body.data)]
  );
  res.json({ ok: true, updatedAt: result.rows[0].updated_at });
});

app.use(express.static(__dirname));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Wednana listening on ${PORT}`);
});
