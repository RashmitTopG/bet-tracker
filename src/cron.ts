import cron from "node-cron";
import { scraperLogic } from "./scraper.js";

// run every day at 06:35 AM IST to capture late-settling bets
cron.schedule("35 6 * * *", async () => {

  console.log("Running daily betting scraper (6:35 AM IST) ...");

  try {

    const data = await scraperLogic();

    console.log("Scraper result:", data);

  } catch (err) {

    console.error("Scraper failed:", err);

  }

}, {
  timezone: "Asia/Kolkata"
});