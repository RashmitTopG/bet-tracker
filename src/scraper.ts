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
  // Use / instead of - to force local timezone parsing
  const parsedDate = new Date(date.replace(/-/g, "/"));
  parsedDate.setHours(0, 0, 0, 0);

  const tomorrow = new Date(parsedDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // store bets
  const filteredBets: Bet[] = [];
  if (bets) {

    for (const bet of bets) {

      if (!bet) continue;

      const betDate = new Date(bet.date.replace(/-/g, "/"));

      // only save bets that fall within yesterday's date range
      if (betDate < parsedDate || betDate >= tomorrow) {
        continue;
      }

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