
import { Router } from "express";
import { Bets } from "../db.js";
import { redisClient } from "../redis.js";

const betRouter = Router();

betRouter.get("/", async (req, res) => {
  try {
    const { date, start, end } = req.query;
    const dateKey = date ? `bets:${date}` : null;
    const rangeKey = start && end ? `bets:${start}-${end}` : null;

    // 1. Try Cache Hits
    const [cachedDate, cachedRange] = await Promise.all([
      dateKey ? redisClient.get(dateKey) : Promise.resolve(null),
      rangeKey ? redisClient.get(rangeKey) : Promise.resolve(null)
    ]);

    if (rangeKey && cachedRange) {
      console.log(`[Redis] Cache Hit for range: ${rangeKey}`);
      return res.json({ bets: JSON.parse(cachedRange) });
    }

    if (dateKey && cachedDate) {
      console.log(`[Redis] Cache Hit for date: ${dateKey}`);
      return res.json({ bets: JSON.parse(cachedDate) });
    }

    // 2. Build DB Filter
    const filter: any = {};
    if (date) {
      const day = new Date(`${date as string}T00:00:00.000Z`);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      filter.date = { $gte: day, $lt: next };
    } else if (start && end) {
      filter.date = {
        $gte: new Date(start as string),
        $lte: new Date(end as string)
      };
    }

    // 3. Fetch from DB
    const bets = await Bets.find(filter).sort({ date: -1 });

    // 4. Update Cache
    if (rangeKey) {
      await redisClient.set(rangeKey, JSON.stringify(bets), { EX: 604800 });
    } else if (dateKey) {
      await redisClient.set(dateKey, JSON.stringify(bets), { EX: 604800 });
    }

    return res.json({ bets });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bets" });
  }
});

export default betRouter;