import { loginTest } from "./login.js";
import { Bets, Profit, Balance } from "./db.js";

export const scraperLogic = async () => {

  const data = await loginTest();

  if (!data) {
    throw new Error("Scraper returned no data");
  }

  const { balance, profit, bets, date } = data;

  if (!date) {
    throw new Error("Date is undefined");
  }
  const parsedDate = new Date(date);

  const tomorrow = new Date(parsedDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // store bets
  if (bets) {

    for (const bet of bets) {

      if (!bet) continue;

      const betDate = new Date(bet.date.replace(" ", "T"));

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

    }

  }

  // store profit
  await Profit.updateOne(
    {
      date: { $gte: parsedDate, $lt: tomorrow }
    },
    {
      $set: {
        date: parsedDate,
        profit,
        totalBets: bets?.length ?? 0
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
      $set: {
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
    bets
  };

};