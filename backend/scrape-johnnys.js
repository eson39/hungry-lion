import puppeteer from "puppeteer";
import { writeFileSync } from "node:fs";

const JOHNNYS_URL = "https://dining.columbia.edu/johnnys";

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export async function scrapeJohnnys() {
  const saveHtml = process.env.SAVE_HTML === "1";

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(JOHNNYS_URL, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 4000));

    try {
      await page.waitForSelector(".cu-dining-menu-tabs, .cu-dining-meals", { timeout: 8000 });
      await new Promise((r) => setTimeout(r, 1000));
    } catch {

    }

    if (saveHtml) {
      writeFileSync("johnnys.html", await page.content(), "utf8");
      console.log("[scrape-johnnys] Saved HTML to johnnys.html");
    }

    const byMeal = { breakfast: [], lunch: [], dinner: [], latenight: [] };

    const extractStations = () =>
      page.evaluate(() => {
        const text = (el) => (el?.textContent || "").trim();
        const stations = [];
        const wrappers = document.querySelectorAll(
          ".cu-dining-meals .wrapper, #cu-dining-meals .wrapper"
        );
        wrappers.forEach((wrapper) => {
          const stationTitle = wrapper.querySelector(".station-title, h2");
          const stationName = stationTitle ? text(stationTitle) : "";
          if (!stationName) return;
          const items = [];
          wrapper.querySelectorAll(".meal-item").forEach((itemEl) => {
            const mealTitle = itemEl.querySelector(".meal-title, h5");
            const itemName = mealTitle ? text(mealTitle) : "";
            if (itemName) items.push(itemName);
          });
          if (items.length > 0) stations.push({ name: stationName, items });
        });
        return stations;
      });

    const tabSelectors = [
      { selector: "Lunch", meals: ["lunch"] },
      { selector: "Dinner", meals: ["dinner"] },
    ];

    for (const { selector, meals } of tabSelectors) {
      try {
        const clicked = await page.evaluate((sel) => {
          const btn = Array.from(
            document.querySelectorAll(".cu-dining-menu-tabs button, .cu-dining-menu-tabs a")
          ).find((el) => el.textContent.trim().toLowerCase() === sel.toLowerCase());
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        }, selector);
        if (clicked) {
          await new Promise((r) => setTimeout(r, 2000));
          const stations = await extractStations();
          if (stations.length > 0) {
            for (const meal of meals) {
              if (byMeal[meal].length === 0) byMeal[meal] = stations;
            }
          }
        }
      } catch {

      }
    }

    if (byMeal.lunch.length === 0 && byMeal.dinner.length === 0) {
      const stations = await extractStations();
      if (stations.length > 0) {
        const activeBtn = await page.evaluate(() => {
          const btn = document.querySelector(".cu-dining-menu-tabs button.active");
          return btn ? btn.textContent.trim().toLowerCase() : "";
        });
        if (activeBtn.includes("lunch")) byMeal.lunch = stations;
        else if (activeBtn.includes("dinner")) byMeal.dinner = stations;
        else {
          byMeal.lunch = stations;
          byMeal.dinner = stations;
        }
      }
    }

    await browser.close();

    const result = {
      breakfast: null,
      lunch: null,
      dinner: null,
      latenight: null,
    };

    for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
      const stations = (byMeal[meal] || [])
        .map((s) => ({
          name: clean(s.name),
          items: [...new Set((s.items || []).map(clean).filter(Boolean))],
        }))
        .filter((s) => s.name && s.items.length > 0);

      if (stations.length > 0) {
        result[meal] = {
          name: "Johnny's",
          hours: "Hours vary",
          stations,
        };
      }
    }

    return result;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

if (process.argv[1]?.includes("scrape-johnnys")) {
  scrapeJohnnys()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
