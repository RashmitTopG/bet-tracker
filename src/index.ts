import dotenv from "dotenv"
dotenv.config();

import express from "express";
import { scraperLogic } from "./scraper.js";
import "./cron.js"
import mongoose from "mongoose";
import {connectRedis} from "./redis.js";
import betRouter from "./routes/betRoutes.js";
import balanceRouter from "./routes/balanceRoutes.js";
import profitRouter from "./routes/profitRoutes.js";

const DB_URL = process.env.MONGO_URL;

const app = express();
const PORT = 3005;

app.use(express.json())
app.use("/bets", betRouter);
app.use("/balance", balanceRouter);
app.use("/profits", profitRouter)

app.get("/", async (req, res) => {

  try {
    const cacheKey = "scraper:latest_data";
    const { redisClient } = await import("./redis.js");

    // Try cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[Redis] Cache Hit for root route: ${cacheKey}`);
      return res.json(JSON.parse(cachedData));
    }

    const data = await scraperLogic();

    // Update cache (expiry 1 hour)
    await redisClient.set(cacheKey, JSON.stringify(data), { EX: 3600 });

    res.json(data);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Scraper failed"
    });

  }

});

const startServer = async () => {

  if (DB_URL == null) {
    throw new Error(`MONGO_DB URL Not Found`);

  }

  console.log(DB_URL);
  await mongoose.connect(DB_URL);
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

}

startServer();


