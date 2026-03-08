import dotenv from "dotenv"
dotenv.config();

import express from "express";
import { scraperLogic } from "./scraper.js";
import "./cron.js"

const app = express();
const PORT = 3000;

app.get("/", async (req,res)=>{

  try {

    const data = await scraperLogic();

    res.json(data);

  } catch(err) {

    console.error(err);

    res.status(500).json({
      error: "Scraper failed"
    });

  }

});

app.listen(PORT , ()=>{
  console.log(`Server running on port ${PORT}`);
});