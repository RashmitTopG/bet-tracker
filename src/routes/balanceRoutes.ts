import { Router } from "express";
import { Balance } from "../db.js";

const balanceRouter = Router();

balanceRouter.get("/" , async (req,res)=>{
    try {
  
        const { date } = req.query;
    
        // yesterday
        const today = new Date();
        today.setHours(0,0,0,0);
    
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
    
        const yesterdayNext = new Date(yesterday);
        yesterdayNext.setDate(yesterdayNext.getDate() + 1);
    
        let requestedFilter = null;
    
        if (date) {
    
          const day = new Date(date as string);
          day.setHours(0,0,0,0);
    
          const next = new Date(day);
          next.setDate(next.getDate() + 1);
    
          requestedFilter = {
            date: {
              $gte: day,
              $lt: next
            }
          };
    
        }
    
        const [latestBalance, requestedBalance] = await Promise.all([
          Balance.findOne({
            date: {
              $gte: yesterday,
              $lt: yesterdayNext
            }
          }),
          requestedFilter ? Balance.findOne(requestedFilter) : null
        ]);
    
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
})

export default balanceRouter;