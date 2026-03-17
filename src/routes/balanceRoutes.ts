import { Router } from "express";
import { Balance } from "../db.js";
import { redisClient } from "../redis.js";

const balanceRouter = Router();

balanceRouter.get("/", async (req, res) => {
  try {
    
    const { date } = req.query;

    const dateKey = date ? `balance:${date}` : null;
    const latestKey = "balance:latest";

    // Try to get both from cache first
    const [cachedLatest, cachedRequested] = await Promise.all([
      redisClient.get(latestKey),
      dateKey ? redisClient.get(dateKey) : Promise.resolve(null)
    ]);

    let latestBalance = null;
    if (cachedLatest) {
      console.log(`[Redis] Cache Hit for latest balance: ${latestKey}`);
      latestBalance = JSON.parse(cachedLatest);
    }

    let requestedBalance = null;
    if (cachedRequested) {
      console.log(`[Redis] Cache Hit for requested balance: ${dateKey}`);
      requestedBalance = JSON.parse(cachedRequested);
    }

    // yesterday calculation (for DB fallback)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayNext = new Date(yesterday);
    yesterdayNext.setDate(yesterdayNext.getDate() + 1);

    // Fetch from DB if not in cache
    const dbPromises = [];
    let fetchLatest = false;
    let fetchRequested = false;

    if (!latestBalance) {
      fetchLatest = true;
      dbPromises.push(Balance.findOne({
        date: { $gte: yesterday, $lt: yesterdayNext }
      }));
    } else {
      dbPromises.push(Promise.resolve(latestBalance));
    }

    if (date && !requestedBalance) {
      fetchRequested = true;
      const day = new Date(date as string);
      day.setHours(0, 0, 0, 0);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      dbPromises.push(Balance.findOne({
        date: { $gte: day, $lt: next }
      }));
    } else {
      dbPromises.push(Promise.resolve(requestedBalance));
    }

    const [dbLatest, dbRequested] = await Promise.all(dbPromises);
    latestBalance = dbLatest;
    requestedBalance = dbRequested;

    // Update cache if we fetched from DB
    if (fetchLatest && latestBalance) {
      await redisClient.set(latestKey, JSON.stringify(latestBalance), { EX: 86400 });
    }
    if (fetchRequested && requestedBalance && dateKey) {
      await redisClient.set(dateKey, JSON.stringify(requestedBalance), { EX: 604800 });
    }

    res.json({
      latestBalance,
      requestedBalance
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to fetch balance"
    });
  }
});

export default balanceRouter;