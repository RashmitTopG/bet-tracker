
import { Router } from "express";
import { Bets } from "../db.js";

const betRouter = Router();

betRouter.get("/" , async(req,res)=>{
    try {
  
        const { date, start, end } = req.query;
    
        console.log(date);
        console.log(start);
        console.log(end);
    
        const filter: any = {};
    
        // SINGLE DATE
        if (date) {
    
          const day = new Date(date as string);
    
          const next = new Date(day);
          next.setDate(next.getDate() + 1);
    
          filter.date = {
            $gte: day,
            $lt: next
          };
    
        }
    
        // DATE RANGE
        if (start && end) {
    
          const startDate = new Date(start as string);
          const endDate = new Date(end as string);
    
          filter.date = {
            $gte: startDate,
            $lte: endDate
          };
    
        }
    
        const bets = await Bets.find(filter).sort({ date: -1 });
    
        console.log(bets);
    
        return res.json({
          bets
        });
    
      } catch (error) {
    
        console.error(error);
    
        res.status(500).json({
          error: "Failed to fetch bets"
        });
    
      }
})

export default betRouter;