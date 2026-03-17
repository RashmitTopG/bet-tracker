import { loginTest, type Bet } from "./login.js";
import { Bets, Profit, Balance } from "./db.js";
import { redisClient } from "./redis.js";

export const scraperLogic = async (): Promise<{ date: string; profit: number; balance: number; bets: Bet[] }> => {

  const data = await loginTest();

  if (!data) {
    throw new Error("Scraper returned no data");
  }

  const { balance, profit, bets, date } = data;

  if (!date) {
    throw new Error("Date is undefined");
  }

  // Set the "day start" explicitly as UTC midnight
  // So '2026-03-10' becomes '2026-03-10T00:00:00.000Z'
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  const tomorrow = new Date(parsedDate);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  // store bets
  const filteredBets: Bet[] = [];
  if (bets) {

    for (const bet of bets) {

      if (!bet) continue;

      // The website displays time in IST (UTC+05:30).
      // Append "+05:30" so that JS converts it correctly into UTC.
      // e.g. "2026/03/11 03:50" -> "2026-03-10T22:20:00.000Z" (which correctly belongs to March 10th UTC)
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

  // store profit
  await Profit.updateOne(
    {
      date: { $gte: parsedDate, $lt: tomorrow }
    },
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
    {
      date: { $gte: parsedDate, $lt: tomorrow }
    },
    {
      $setOnInsert: balanceUpdate
    },
    { upsert: true }
  );

  // Sync with Redis
  try {
    
    const dateKey = `balance:${date}`;
    const latestKey = "balance:latest";

    // Always update latest
    await redisClient.set(latestKey, JSON.stringify(balanceUpdate), {
      EX: 86400 // 24 hours
    });

    // Also update date-specific key
    await redisClient.set(dateKey, JSON.stringify(balanceUpdate), {
      EX: 604800 // 7 days
    });
  } catch (redisError) {
    console.error("Failed to update Redis from scraper:", redisError);
  }

  return {
    date,
    profit,
    balance,
    bets: filteredBets
  };

};