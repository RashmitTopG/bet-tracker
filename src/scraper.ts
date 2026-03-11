import { loginTest, type Bet } from "./login.js";
import { Bets, Profit, Balance } from "./db.js";

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
  await Balance.updateOne(
    {
      date: { $gte: parsedDate, $lt: tomorrow }
    },
    {
      $setOnInsert: {
        date: parsedDate,
        balance
      }
    },
    { upsert: true }
  );

  return {
    date,
    profit,
    balance,
    bets: filteredBets
  };

};