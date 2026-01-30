import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "https://liondine.com";
const MEALS = ["breakfast", "lunch", "dinner", "latenight"];

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export async function scrapeMeal(meal) {
  const url = `${BASE_URL}/${meal}`;
  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (HungryLionScraper)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  const halls = [];

  $("div.col").each((_, col) => {
    const hallName = clean($(col).find("a h3").first().text());
    if (!hallName) return;

    const hours = clean($(col).find("div.hours").first().text());

    const stations = [];
    const menu = $(col).find("div.menu").first();

    if (menu.length) {
      let currentStation = "";
      let currentItems = [];

      menu.children().each((_, child) => {
        const el = $(child);

        if (el.hasClass("food-type")) {
          if (currentStation) {
            stations.push({
              name: currentStation,
              items: [...currentItems],
            });
            currentItems = [];
          }
          currentStation = clean(el.text());
        } else if (el.hasClass("food-name")) {
          const item = clean(el.text());
          if (item) currentItems.push(item);
        }
      });

      if (currentStation) {
        stations.push({
          name: currentStation,
          items: [...currentItems],
        });
      }
    }

    halls.push({
      name: hallName,
      hours,
      stations,
    });
  });

  return { meal: meal.toLowerCase(), halls };
}

export async function scrapeAllMeals() {
  const results = {};
  for (const meal of MEALS) {
    results[meal] = await scrapeMeal(meal);
  }
  return results;
}

const isMainModule =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const all = await scrapeAllMeals();
  console.log(JSON.stringify(all, null, 2));
}
