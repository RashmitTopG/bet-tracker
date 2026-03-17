import { Router } from "express";
import { Profit } from "../db.js";
import { redisClient } from "../redis.js";

const profitRouter = Router();

profitRouter.get("/", async (req, res) => {
  try {
    
    const { date, start, end } = req.query;
    const dateKey = date ? `profit:${date}` : null;
    const rangeKey = start && end ? `profit:${start}-${end}` : null;
    const totalKey = "profit:total"; 

    // 1. Fetch all potential cache hits
    const [cachedDate, cachedRange, cachedTotal] = await Promise.all([
      dateKey ? redisClient.get(dateKey) : null,
      rangeKey ? redisClient.get(rangeKey) : null,
      redisClient.get(totalKey)
    ]);

    // 2. Determine what actually needs to be queried from DB
    const dbPromises = [];

    // Total Profit (Always requested in your return object)
    if (cachedTotal) {
      console.log(`[Redis] Cache Hit for total profit`);
      dbPromises.push(Promise.resolve([{ total: JSON.parse(cachedTotal) }]));
    } else {
      dbPromises.push(Profit.aggregate([{ $group: { _id: null, total: { $sum: "$profit" } } }]));
    }

    // Date Profit
    if (date) {
      if (cachedDate) {
        console.log(`[Redis] Cache Hit for date: ${dateKey}`);
        dbPromises.push(Promise.resolve([{ total: JSON.parse(cachedDate) }]));
      } else {
        const day = new Date(date as string);
        day.setHours(0, 0, 0, 0);
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
        dbPromises.push(Profit.aggregate([
          { $match: { date: { $gte: day, $lt: next } } },
          { $group: { _id: null, total: { $sum: "$profit" } } }
        ]));
      }
    } else {
      dbPromises.push(Promise.resolve(null));
    }

    // Range Profit
    if (start && end) {
      if (cachedRange) {
        console.log(`[Redis] Cache Hit for range: ${rangeKey}`);
        dbPromises.push(Promise.resolve([{ total: JSON.parse(cachedRange) }]));
      } else {
        const startDate = new Date(start as string);
        const endDate = new Date(end as string);
        endDate.setDate(endDate.getDate() + 1);
        dbPromises.push(Profit.aggregate([
          { $match: { date: { $gte: startDate, $lt: endDate } } },
          { $group: { _id: null, total: { $sum: "$profit" } } }
        ]));
      }
    } else {
      dbPromises.push(Promise.resolve(null));
    }

    // 3. Execute DB queries
    const [dbTotal, dbDate, dbRange] = await Promise.all(dbPromises);

    const totalVal = dbTotal?.[0]?.total ?? 0;
    const dateVal = dbDate?.[0]?.total ?? 0;
    const rangeVal = dbRange?.[0]?.total ?? 0;

    // 4. Update Cache for misses
    if (!cachedTotal) await redisClient.set(totalKey, JSON.stringify(totalVal), { EX: 3600 });
    if (dateKey && !cachedDate) await redisClient.set(dateKey, JSON.stringify(dateVal), { EX: 604800 });
    if (rangeKey && !cachedRange) await redisClient.set(rangeKey, JSON.stringify(rangeVal), { EX: 604800 });

    // 5. Consistent Response
    res.json({
      totalProfit: totalVal,
      dateProfit: dateVal,
      rangeProfit: rangeVal
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch profits" });
  }
});


export default profitRouter;