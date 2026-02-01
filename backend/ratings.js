import { getDb, getRatingsCollection } from "./db.js";

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getRatingsForDate(dateKey) {
  return getDb().then(async () => {
    const coll = getRatingsCollection();
    const docs = await coll.find({ dateKey }).toArray();
    const byHall = {};
    for (const doc of docs) {
      const { hallName, rating, visitorId, at } = doc;
      if (!byHall[hallName]) byHall[hallName] = [];
      byHall[hallName].push({ rating, visitorId, at });
    }
    return byHall;
  });
}

export async function findExistingRating(visitorId, hallName) {
  if (!visitorId) return null;
  await getDb();
  const coll = getRatingsCollection();
  const doc = await coll.findOne({ visitorId, hallName });
  if (!doc) return null;
  return {
    dateKey: doc.dateKey,
    index: 0,
    entry: { rating: doc.rating, visitorId: doc.visitorId, at: doc.at },
    _id: doc._id,
  };
}

export async function addRating(dateKey, hallName, rating, visitorId) {
  if (typeof hallName !== "string" || !hallName.trim()) {
    throw new Error("hallName is required");
  }
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    throw new Error("rating must be an integer from 1 to 5");
  }
  await getDb();
  const coll = getRatingsCollection();
  const trimmedHallName = hallName.trim();
  const at = Date.now();

  if (visitorId) {
    const existing = await findExistingRating(visitorId, trimmedHallName);
    if (existing) {
      await coll.deleteOne({ _id: existing._id });
    }
  }

  await coll.insertOne({
    dateKey,
    hallName: trimmedHallName,
    rating: r,
    visitorId: visitorId || null,
    at,
  });

  const docs = await coll.find({ dateKey, hallName: trimmedHallName }).toArray();
  const sum = docs.reduce((acc, d) => acc + d.rating, 0);
  const average = Math.round((sum / docs.length) * 10) / 10;
  const userRating = visitorId
    ? docs.find((d) => d.visitorId === visitorId)?.rating
    : undefined;

  return {
    average,
    count: docs.length,
    ...(userRating != null && { userRating }),
  };
}

export async function getTodayAverages(visitorId = null) {
  const dateKey = getTodayKey();
  const byHall = await getRatingsForDate(dateKey);
  const result = {};
  for (const [hallName, ratings] of Object.entries(byHall)) {
    if (!ratings.length) continue;
    const sum = ratings.reduce((acc, entry) => acc + entry.rating, 0);
    const average = Math.round((sum / ratings.length) * 10) / 10;
    const userRating = visitorId
      ? ratings.find((e) => e.visitorId === visitorId)?.rating
      : undefined;
    result[hallName] = {
      average,
      count: ratings.length,
      ...(userRating != null && { userRating }),
    };
  }
  return result;
}

export { getTodayKey };
