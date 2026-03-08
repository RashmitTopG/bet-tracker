import dotenv from "dotenv"
dotenv.config();

import express from "express";
import { scraperLogic } from "./scraper.js";
import "./cron.js"
import mongoose from "mongoose";
const DB_URL = process.env.MONGO_URL;

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

const startServer = async()=>{

    if(DB_URL == null){
        throw console.error(`MONGO_DB URL Not Found`);
        
    }
    
    console.log(DB_URL);
    await mongoose.connect(DB_URL);
    app.listen(PORT , ()=>{
        console.log(`Server running on port ${PORT}`);
      });      

}

startServer();


