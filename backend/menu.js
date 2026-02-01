import { getDb, getMenuCollection } from "./db.js";
import { scrapeAllMeals } from "./scrape.js";

const MENU_DOC_ID = "latest";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export async function getMenu() {
  await getDb();
  const coll = getMenuCollection();
  const doc = await coll.findOne({ _id: MENU_DOC_ID });
  return doc?.data ?? {};
}

export async function refreshMenu() {
  try {
    const data = await scrapeAllMeals();
    await getDb();
    const coll = getMenuCollection();
    await coll.updateOne(
      { _id: MENU_DOC_ID },
      { $set: { data, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log("[menu] Refreshed at", new Date().toISOString());
    return data;
  } catch (e) {
    console.error("[menu] Refresh failed:", e.message);
    throw e;
  }
}

export { REFRESH_INTERVAL_MS };
