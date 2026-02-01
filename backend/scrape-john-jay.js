import puppeteer from "puppeteer";
import { writeFileSync } from "node:fs";

const JOHN_JAY_URL = "https://dining.columbia.edu/content/john-jay-dining-hall";

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function tabToMeals(tabText) {
  const t = (tabText || "").toLowerCase();
  if (t.includes("brunch") || t.includes("breakfast")) return ["breakfast"];
  if (t.includes("lunch") && t.includes("dinner")) return ["lunch", "dinner"];
  if (t.includes("lunch")) return ["lunch"];
  if (t.includes("dinner")) return ["dinner"];
  return ["lunch"];
}

export async function scrapeJohnJay() {
  const saveHtml = process.env.SAVE_HTML === "1";

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(JOHN_JAY_URL, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 4000));

    try {
      await page.waitForSelector(".indicator .marker, .indicator-item .marker, .cu-dining-menu-tabs", {
        timeout: 8000,
      });
      await new Promise((r) => setTimeout(r, 1000));
    } catch {

    }

    if (saveHtml) {
      writeFileSync("john-jay.html", await page.content(), "utf8");
      console.log("[scrape-john-jay] Saved HTML to john-jay.html");
    }

    const byMeal = { breakfast: [], lunch: [], dinner: [], latenight: [] };
    let capacityPercent = null;

    const extractAndGetActiveTab = () =>
      page.evaluate(() => {
        const text = (el) => (el?.textContent || "").trim();
        let cap = null;
        const marker = document.querySelector(
          ".cu-dining-crowdedness .marker, .indicator .marker, .indicator-item .marker"
        );
        if (marker) {
          const m = text(marker).match(/(\d+)\s*%/);
          if (m) cap = parseInt(m[1], 10);
        }

        const activeBtn = document.querySelector(".cu-dining-menu-tabs button.active");
        const activeTab = activeBtn ? text(activeBtn) : "";

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

        return { stations, capacityPercent: cap, activeTab };
      });

    const tabSelectors = [
      { selector: "Brunch", meals: ["breakfast"] },
      { selector: "Breakfast", meals: ["breakfast"] },
      { selector: "Lunch", meals: ["lunch"] },
      { selector: "Lunch & Dinner", meals: ["lunch", "dinner"] },
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
          const { stations, capacityPercent: cap, activeTab } = await extractAndGetActiveTab();
          if (cap != null) capacityPercent = cap;
          if (stations.length > 0) {
            for (const meal of meals) {
              if (byMeal[meal].length === 0) byMeal[meal] = stations;
            }
          }
        }
      } catch {

      }
    }

    if (byMeal.breakfast.length === 0 && (byMeal.lunch.length > 0 || byMeal.dinner.length > 0)) {
      const { stations, capacityPercent: cap } = await extractAndGetActiveTab();
      if (cap != null) capacityPercent = cap;
      if (stations.length > 0) {
        const activeBtn = await page.evaluate(() => {
          const btn = document.querySelector(".cu-dining-menu-tabs button.active");
          return btn ? btn.textContent.trim() : "";
        });
        const meals = tabToMeals(activeBtn);
        for (const meal of meals) {
          if (byMeal[meal].length === 0) byMeal[meal] = stations;
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
          name: "John Jay",
          hours: "Hours vary",
          stations,
          ...(capacityPercent != null && { capacityPercent }),
        };
      }
    }

    if (capacityPercent != null) {
      console.log("[scrape-john-jay] Capacity:", capacityPercent + "%");
    }

    return result;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

if (process.argv[1]?.includes("scrape-john-jay")) {
  scrapeJohnJay()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
