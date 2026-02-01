import puppeteer from "puppeteer";
import { writeFileSync } from "node:fs";

const FERRIS_URL = "https://dining.columbia.edu/content/ferris-booth-commons-0";

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

export async function scrapeFerris() {
  const saveHtml = process.env.SAVE_HTML === "1";

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(FERRIS_URL, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 4000));

    try {
      await page.waitForSelector(".indicator .marker, .indicator-item .marker, .cu-dining-crowdedness .marker", {
        timeout: 8000,
      });
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      
    }

    if (saveHtml) {
      const html = await page.content();
      writeFileSync("ferris.html", html, "utf8");
      console.log("[scrape-ferris] Saved HTML to ferris.html");
    }

    const data = await page.evaluate(() => {
      const text = (el) => (el?.textContent || "").trim();
      function inferMeals(title) {
        if (!title) return ["lunch"];
        const t = title.toLowerCase();
        if (t.includes("breakfast") || t.includes("brunch")) return ["breakfast"];
        if ((t.includes("lunch") && t.includes("dinner")) || t.includes("lunch & dinner"))
          return ["lunch", "dinner"];
        if (t.includes("lunch")) return ["lunch"];
        if (t.includes("dinner")) return ["dinner"];
        if (t.includes("late") || t.includes("latenight")) return ["latenight"];
        return ["lunch"];
      }

      const container = document.querySelector("#cu-dining-meals, .cu-dining-meals");
      const bodyText = document.body.innerText;
      const hoursMatch = bodyText.match(/Open[^.]+\.|[\d:]+\s*[ap]\.m\.\s*[-–to]+\s*[\d:]+\s*[ap]\.m\./);
      const hours = hoursMatch ? hoursMatch[0].trim() : "";

      let capacityPercent = null;
      const marker = document.querySelector(
        ".cu-dining-crowdedness .marker, .indicator .marker, .indicator-item .marker"
      );
      if (marker) {
        const txt = text(marker);
        const m = txt.match(/(\d+)\s*%\s*Full/i) || txt.match(/(\d+)\s*%/);
        if (m) capacityPercent = parseInt(m[1], 10);
      }
      if (capacityPercent == null) {
        const bar = document.querySelector(
          ".cu-dining-crowdedness .bar, .indicator .bar, .indicator-item .bar"
        );
        if (bar && bar.style && bar.style.width) {
          const m = bar.style.width.match(/(\d+)/);
          if (m) capacityPercent = parseInt(m[1], 10);
        }
      }

      const byMeal = { breakfast: [], lunch: [], dinner: [], latenight: [] };
      const menus = container
        ? container.querySelectorAll(".menus")
        : document.querySelectorAll(".cu-dining-meals .menus, #cu-dining-meals .menus");

      if (menus.length === 0) {
        const wrappers = document.querySelectorAll(".cu-dining-meals .wrapper, #cu-dining-meals .wrapper, .wrapper");
        const stations = [];
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
        if (stations.length > 0) byMeal.lunch = stations;
      } else {
        menus.forEach((menuEl) => {
          const title = menuEl.getAttribute("data-date-range-title") || "";
          const meals = inferMeals(title);

          const stations = [];
          menuEl.querySelectorAll(".wrapper").forEach((wrapper) => {
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

          if (stations.length > 0) {
            for (const meal of meals) {
              const existing = byMeal[meal];
              const seen = new Set(existing.map((s) => s.name));
              stations.forEach((s) => {
                if (!seen.has(s.name)) {
                  byMeal[meal].push(s);
                  seen.add(s.name);
                }
              });
            }
          }
        });
      }

      return { byMeal, hours, capacityPercent };
    });

    await browser.close();

    const hours = clean(data.hours) || "Hours vary";
    if (data.capacityPercent != null) {
      console.log("[scrape-ferris] Capacity:", data.capacityPercent + "%");
    }

    const result = {
      breakfast: null,
      lunch: null,
      dinner: null,
      latenight: null,
    };

    const byMeal = data.byMeal || {};

    for (const meal of ["breakfast", "lunch", "dinner", "latenight"]) {
      const stations = (byMeal[meal] || [])
        .map((s) => ({
          name: clean(s.name),
          items: [...new Set((s.items || []).map(clean).filter(Boolean))],
        }))
        .filter((s) => s.name && s.items.length > 0);

      if (stations.length > 0) {
        result[meal] = {
          name: "Ferris Booth Commons",
          hours,
          stations,
          ...(data.capacityPercent != null && { capacityPercent: data.capacityPercent }),
        };
      }
    }

    return result;
  } catch (e) {
    await browser.close();
    throw e;
  }
}

if (process.argv[1]?.includes("scrape-ferris")) {
  scrapeFerris()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
