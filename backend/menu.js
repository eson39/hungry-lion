import { getDb, getMenuCollection } from "./db.js";
import { scrapeAllMeals } from "./scrape.js";
import { scrapeJohnJay } from "./scrape-john-jay.js";
import { scrapeFerris } from "./scrape-ferris.js";
import { scrapeJohnnys } from "./scrape-johnnys.js";

const MENU_DOC_ID = "latest";
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

const JOHN_JAY_HOURS = {
  breakfast: "9:30 a.m. – 11:00 a.m.",
  lunch: "11:00 a.m. – 2:30 p.m.",
  dinner: "5:00 p.m. – 9:00 p.m.",
  latenight: "5:00 p.m. – 9:00 p.m.",
};

const FERRIS_HOURS = {
  breakfast: "7:30 a.m. – 11:00 a.m.",
  lunch: "11:00 a.m. – 5:00 p.m.",
  dinner: "5:00 p.m. – Closing",
  latenight: "5:00 p.m. – Closing",
};

function getCapacityFromScraper(scraperData) {
  if (!scraperData) return null;
  for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
    const cap = scraperData[meal]?.capacityPercent;
    if (cap != null) return cap;
  }
  return null;
}

function mergeJohnJayFromScraper(data, johnJayData) {
  if (!johnJayData) return data;
  const result = { ...data };
  const capacityPercent = getCapacityFromScraper(johnJayData);
  for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
    if (!result[meal]?.halls) continue;
    const scraped = johnJayData[meal];
    const lionDineHall = result[meal].halls.find((h) => h.name === "John Jay");
    const halls = result[meal].halls.filter((h) => h.name !== "John Jay");
    if (scraped) {
      halls.push({
        name: "John Jay",
        hours: lionDineHall?.hours || JOHN_JAY_HOURS[meal],
        stations: scraped.stations,
        ...(capacityPercent != null && { capacityPercent }),
      });
    } else if (lionDineHall) {
      halls.push({
        ...lionDineHall,
        ...(capacityPercent != null && { capacityPercent }),
      });
    }
    result[meal] = { ...result[meal], halls };
  }
  return result;
}

const FERRIS_NAMES = ["Ferris Booth Commons", "Ferris", "Ferris Booth"];

function mergeFerrisFromScraper(data, ferrisData) {
  if (!ferrisData) return data;
  const result = { ...data };
  const capacityPercent = getCapacityFromScraper(ferrisData);
  for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
    if (!result[meal]?.halls) continue;
    const scraped = ferrisData[meal];
    const lionDineHall = result[meal].halls.find((h) => FERRIS_NAMES.includes(h.name));
    const halls = result[meal].halls.filter((h) => !FERRIS_NAMES.includes(h.name));
    if (scraped) {
      halls.push({
        name: "Ferris Booth Commons",
        hours: lionDineHall?.hours || FERRIS_HOURS[meal],
        stations: scraped.stations,
        ...(capacityPercent != null && { capacityPercent }),
      });
    } else if (lionDineHall) {
      halls.push({
        ...lionDineHall,
        name: "Ferris Booth Commons",
        ...(capacityPercent != null && { capacityPercent }),
      });
    }
    result[meal] = { ...result[meal], halls };
  }
  return result;
}

const JOHNNYS_NAMES = ["Johnny's", "Johnny's Food Truck"];

function mergeJohnnysFromScraper(data, johnnysData) {
  if (!johnnysData) return data;
  const result = { ...data };
  for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
    if (!result[meal]?.halls) continue;
    const scraped = johnnysData[meal];
    const lionDineHall = result[meal].halls.find((h) => JOHNNYS_NAMES.includes(h.name));
    const halls = result[meal].halls.filter((h) => !JOHNNYS_NAMES.includes(h.name));
    if (scraped) {
      halls.push({
        name: "Johnny's",
        hours: lionDineHall?.hours || "Hours vary",
        stations: scraped.stations,
      });
    } else if (lionDineHall) {
      halls.push({ ...lionDineHall, name: "Johnny's" });
    }
    result[meal] = { ...result[meal], halls };
  }
  return result;
}

const HALL_ORDER = [
  "Ferris Booth Commons",
  "John Jay",
  "Faculty House",
  "JJ's",
  "Fac Shack",
  "Johnny's",
  "Chef Don's",
  "Chef Mike's",
  "Diana",
  "Grace Dodge",
  "Hewitt",
];

function sortHalls(halls) {
  return [...halls].sort((a, b) => {
    const i = HALL_ORDER.indexOf(a.name);
    const j = HALL_ORDER.indexOf(b.name);
    if (i >= 0 && j >= 0) return i - j;
    if (i >= 0) return -1;
    if (j >= 0) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });
}

export async function getMenu() {
  await getDb();
  const coll = getMenuCollection();
  const doc = await coll.findOne({ _id: MENU_DOC_ID });
  const data = doc?.data ?? {};
  for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
    if (data[meal]?.halls?.length) {
      data[meal] = { ...data[meal], halls: sortHalls(data[meal].halls) };
    }
  }
  return data;
}

export async function refreshMenu() {
  try {
    const scraped = await scrapeAllMeals();
    let johnJayData = null;
    try {
      johnJayData = await scrapeJohnJay();
    } catch (e) {
      console.warn("[menu] John Jay scraper failed:", e.message);
    }
    let ferrisData = null;
    try {
      ferrisData = await scrapeFerris();
    } catch (e) {
      console.warn("[menu] Ferris scraper failed:", e.message);
    }
    let johnnysData = null;
    try {
      johnnysData = await scrapeJohnnys();
    } catch (e) {
      console.warn("[menu] Johnny's scraper failed:", e.message);
    }
    let data = mergeJohnJayFromScraper(scraped, johnJayData);
    data = mergeFerrisFromScraper(data, ferrisData);
    data = mergeJohnnysFromScraper(data, johnnysData);
    for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
      if (data[meal]?.halls?.length) {
        data[meal] = { ...data[meal], halls: sortHalls(data[meal].halls) };
      }
    }
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
