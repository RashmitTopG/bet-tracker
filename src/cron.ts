import cron from "node-cron";
import { scraperLogic } from "./scraper.js";

// run every dat 00:05
cron.schedule("5 0 * * *", async () => {

  console.log("Running daily betting scraper...");

  try {

    const data = await scraperLogic();

    console.log("Scraper result:", data);

  } catch (err) {

    console.error("Scraper failed:", err);

  }

});