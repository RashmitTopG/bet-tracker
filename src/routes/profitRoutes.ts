import { Router } from "express";
import { Profit } from "../db.js";

const profitRouter = Router();

profitRouter.get("/", async (req, res) => {

    try {
  
      const { date, start, end } = req.query;
  
      let dateFilter: any = {};
      let rangeFilter: any = {};
  
      // -------- DATE FILTER --------
  
      if (date) {
  
        const day = new Date(date as string);
        day.setHours(0,0,0,0);
  
        const next = new Date(day);
        next.setDate(next.getDate() + 1);
  
        dateFilter = {
          date: {
            $gte: day,
            $lt: next
          }
        };
  
      }
  
      // -------- RANGE FILTER --------
  
      if (start && end) {
  
        const startDate = new Date(start as string);
        startDate.setHours(0,0,0,0);
  
        const endDate = new Date(end as string);
        endDate.setHours(0,0,0,0);
        endDate.setDate(endDate.getDate() + 1);
  
        rangeFilter = {
          date: {
            $gte: startDate,
            $lt: endDate
          }
        };
  
      }
  
      const [totalProfit, dateProfit, rangeProfit] = await Promise.all([
  
        // TOTAL PROFIT
        Profit.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$profit" }
            }
          }
        ]),
  
        // DATE PROFIT
        date ? Profit.aggregate([
          { $match: dateFilter },
          {
            $group: {
              _id: null,
              total: { $sum: "$profit" }
            }
          }
        ]) : null,
  
        // RANGE PROFIT
        start && end ? Profit.aggregate([
          { $match: rangeFilter },
          {
            $group: {
              _id: null,
              total: { $sum: "$profit" }
            }
          }
        ]) : null
  
      ]);
  
      res.json({
  
        totalProfit: totalProfit?.[0]?.total ?? 0,
        dateProfit: dateProfit?.[0]?.total ?? 0,
        rangeProfit: rangeProfit?.[0]?.total ?? 0
  
      });
  
    } catch (error) {
  
      console.error(error);
  
      res.status(500).json({
        error: "Failed to fetch profits"
      });
  
    }
  
  });

export default profitRouter;