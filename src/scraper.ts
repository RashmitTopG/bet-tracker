import { loginTest, type Bet } from "./login.js";
import { Bets, Profit, Balance } from "./db.js";
import { redisClient } from "./redis.js";

export const scraperLogic = async (): Promise<{ date: string; profit: number; balance: number; bets: Bet[] }> => {
  const now = new Date();
  let yesterdayData: any = null;
  const summary: any[] = [];

  console.log("Starting 7-day backfill check...");

  // Search from oldest (7 days ago) to newest (yesterday)
  for (let i = 7; i >= 1; i--) {
    const targetDate = new Date(now.getTime() - i * 86400000);
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    const formattedDate = formatter.format(targetDate);
    const parsedDate = new Date(`${formattedDate}T00:00:00.000Z`);

    // Check if we already have profit data for this date
    const existingProfit = await Profit.findOne({ date: parsedDate });
    
    if (existingProfit) {
      console.log(`[${formattedDate}] Data already exists. Skipping.`);
      
      summary.push({
        Date: formattedDate,
        Profit: existingProfit.profit,
        Bets: existingProfit.totalBets || 0,
        Status: "Existing"
      });

      // If it's yesterday (i=1), we fetch the full data from DB to return it
      if (i === 1) {
        const existingBalance = await Balance.findOne({ date: { $gte: parsedDate, $lt: new Date(parsedDate.getTime() + 86400000) } });
        const existingBets = await Bets.find({ 
          date: { $gte: parsedDate, $lt: new Date(parsedDate.getTime() + 86400000) } 
        });
        
        yesterdayData = {
          date: formattedDate,
          profit: existingProfit.profit,
          balance: existingBalance?.balance || 0,
          bets: existingBets as unknown as Bet[]
        };
      }
      continue;
    }

    console.log(`[${formattedDate}] Data missing. Scraping...`);
    const data = await loginTest(formattedDate);

    if (!data) {
      console.error(`[${formattedDate}] Scraper returned no data.`);
      summary.push({ Date: formattedDate, Profit: 0, Bets: 0, Status: "Failed" });
      continue;
    }

    const { balance, profit, bets, date } = data;
    const tomorrow = new Date(parsedDate);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // store bets
    const filteredBets: Bet[] = [];
    if (bets) {
      for (const bet of bets) {
        if (!bet) continue;
        const betDate = new Date(bet.date.replace(/-/g, "/") + " +05:30");
        await Bets.updateOne(
          { betId: bet.betId },
          {
            $set: {
              date: betDate,
              eventType: bet.eventType,
              event: bet.event,
              amount: bet.amount
            }
          },
          { upsert: true }
        );
        filteredBets.push(bet);
      }
    }

    // store profit (always create a record, even if profit is 0, to avoid re-scraping)
    await Profit.updateOne(
      { date: { $gte: parsedDate, $lt: tomorrow } },
      {
        $setOnInsert: {
          date: parsedDate,
          profit,
          totalBets: filteredBets.length
        }
      },
      { upsert: true }
    );

    // store balance
    const balanceUpdate = {
      date: parsedDate,
      balance
    };
    await Balance.updateOne(
      { date: { $gte: parsedDate, $lt: tomorrow } },
      { $setOnInsert: balanceUpdate },
      { upsert: true }
    );

    // Sync with Redis
    try {
      const dateKey = `balance:${date}`;
      const latestKey = "balance:latest";
      await redisClient.set(latestKey, JSON.stringify(balanceUpdate), { EX: 86400 });
      await redisClient.set(dateKey, JSON.stringify(balanceUpdate), { EX: 604800 });
    } catch (redisError) {
      console.error("Failed to update Redis from scraper:", redisError);
    }

    summary.push({
      Date: formattedDate,
      Profit: profit,
      Bets: filteredBets.length,
      Status: "Scraped"
    });

    if (i === 1) {
      yesterdayData = {
        date: formattedDate,
        profit,
        balance,
        bets: filteredBets
      };
    }
  }

  // Display summary of all 7 days in the console
  console.log("\n--- 7-DAY RESULTS SUMMARY ---");
  console.table(summary);
  console.log("-----------------------------\n");

  if (!yesterdayData) {
    throw new Error("Scraper could not retrieve or find data for yesterday (the report date).");
  }

  return yesterdayData;
};