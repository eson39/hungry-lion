import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RATINGS_PATH = join(__dirname, "ratings.json");

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readAll() {
  try {
    const data = await readFile(RATINGS_PATH, "utf8");
    return JSON.parse(data);
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

async function writeAll(data) {
  await writeFile(RATINGS_PATH, JSON.stringify(data, null, 2), "utf8");
}

function ratingValue(entry) {
  return typeof entry === "number" ? entry : entry.rating;
}

export function getRatingsForDate(dateKey) {
  return readAll().then((data) => data[dateKey] ?? {});
}

export async function findExistingRating(visitorId, hallName) {
  if (!visitorId) return null;
  const data = await readAll();
  for (const byHall of Object.values(data)) {
    const entries = byHall[hallName];
    if (!Array.isArray(entries)) continue;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (typeof entry === "object" && entry.visitorId === visitorId) {
        return { dateKey: Object.keys(data).find(k => data[k] === byHall), index: i, entry };
      }
    }
  }
  return null;
}

export async function addRating(dateKey, hallName, rating, visitorId) {
  if (typeof hallName !== "string" || !hallName.trim()) {
    throw new Error("hallName is required");
  }
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    throw new Error("rating must be an integer from 1 to 5");
  }
  const data = await readAll();
  const trimmedHallName = hallName.trim();
  
  // Check if user already rated this hall
  if (visitorId) {
    const existing = await findExistingRating(visitorId, trimmedHallName);
    if (existing) {
      // Remove old rating from old date
      const existingDateKey = existing.dateKey;
      if (data[existingDateKey] && data[existingDateKey][trimmedHallName]) {
        data[existingDateKey][trimmedHallName].splice(existing.index, 1);
        // Clean up empty arrays
        if (data[existingDateKey][trimmedHallName].length === 0) {
          delete data[existingDateKey][trimmedHallName];
        }
        if (Object.keys(data[existingDateKey]).length === 0) {
          delete data[existingDateKey];
        }
      }
    }
  }
  
  // Add/update rating for today
  if (!data[dateKey]) data[dateKey] = {};
  if (!data[dateKey][trimmedHallName]) data[dateKey][trimmedHallName] = [];
  data[dateKey][trimmedHallName].push({ rating: r, visitorId: visitorId || null, at: Date.now() });
  await writeAll(data);
  const arr = data[dateKey][trimmedHallName];
  const sum = arr.reduce((acc, entry) => acc + ratingValue(entry), 0);
  const average = Math.round((sum / arr.length) * 10) / 10;
  let userRating = undefined;
  if (visitorId) {
    const entry = arr.find((e) => typeof e === "object" && e.visitorId === visitorId);
    if (entry) userRating = entry.rating;
  }
  return { average, count: arr.length, ...(userRating != null && { userRating }) };
}

export async function getTodayAverages(visitorId = null) {
  const dateKey = getTodayKey();
  const byHall = await getRatingsForDate(dateKey);
  const result = {};
  for (const [hallName, ratings] of Object.entries(byHall)) {
    if (!ratings.length) continue;
    const sum = ratings.reduce((acc, entry) => acc + ratingValue(entry), 0);
    const average = Math.round((sum / ratings.length) * 10) / 10;
    let userRating = undefined;
    if (visitorId) {
      const entry = ratings.find((e) => typeof e === "object" && e.visitorId === visitorId);
      if (entry) userRating = entry.rating;
    }
    result[hallName] = { average, count: ratings.length, ...(userRating != null && { userRating }) };
  }
  return result;
}

export { getTodayKey };
