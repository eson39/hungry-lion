import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { getDb } from "./db.js";
import { getMenu, refreshMenu, REFRESH_INTERVAL_MS } from "./menu.js";
import { getTodayAverages, addRating, getTodayKey } from "./ratings.js";

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
].filter(Boolean);

app.set("trust proxy", 1);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

const COOKIE_OPTS = { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: "lax", path: "/" };

function getVisitorId(req, res) {
  const raw = req.headers.cookie;
  let visitorId = null;
  if (raw) {
    const m = raw.match(/\bvisitor_id=([^;]+)/);
    if (m) visitorId = m[1].trim();
  }
  if (!visitorId) {
    visitorId = randomUUID();
    res.cookie("visitor_id", visitorId, COOKIE_OPTS);
  }
  return visitorId;
}

function getVisitorIdOptional(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const m = raw.match(/\bvisitor_id=([^;]+)/);
  return m ? m[1].trim() : null;
}

app.get("/", (req, res) => {
  res.json({
    message: "LionDine menu API",
    endpoints: {
      "GET /api/menu": "All meals (breakfast, lunch, dinner, latenight)",
      "GET /api/menu/:meal": "Single meal (e.g. /api/menu/breakfast)",
    },
  });
});

app.get("/api/menu", async (req, res) => {
  try {
    const data = await getMenu();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/menu/:meal", async (req, res) => {
  try {
    const menu = await getMenu();
    const meal = req.params.meal?.toLowerCase();
    const data = menu[meal];
    if (!data) {
      res.status(404).json({ error: `Meal '${meal}' not found` });
      return;
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/ratings/debug", (req, res) => {
  res.json({
    dateKey: getTodayKey(),
    timezone: "America/New_York",
    serverTime: new Date().toISOString(),
  });
});

app.get("/api/ratings/today", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    const visitorId = getVisitorIdOptional(req);
    const data = await getTodayAverages(visitorId);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/ratings", async (req, res) => {
  try {
    const visitorId = getVisitorId(req, res);
    const { hallName, rating } = req.body ?? {};
    if (typeof hallName !== "string" || !hallName.trim()) {
      res.status(400).json({ error: "hallName is required" });
      return;
    }
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      res.status(400).json({ error: "rating must be an integer from 1 to 5" });
      return;
    }
    const dateKey = getTodayKey();
    const result = await addRating(dateKey, hallName.trim(), r, visitorId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

getDb()
  .then(async () => {
    try {
      await refreshMenu();
    } catch (e) {
      console.warn("Initial menu refresh failed; will retry on interval:", e.message);
    }
    setInterval(() => {
      refreshMenu().catch(() => {});
    }, REFRESH_INTERVAL_MS);
    const port = Number(process.env.PORT) || 3001;
    app.listen(port, () => {
      console.log(`Backend running on port ${port} (menu refreshes every 15 min)`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });
