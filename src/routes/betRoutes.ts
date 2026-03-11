
import { Router } from "express";
import { Bets } from "../db.js";

const betRouter = Router();

betRouter.get("/", async (req, res) => {
  try {

    const { date, start, end } = req.query;

    console.log(date);
    console.log(start);
    console.log(end);

    const filter: any = {};

    // SINGLE DATE
    if (date) {

      // "2026-03-11" becomes 2026-03-11T00:00:00.000Z
      const day = new Date(`${date as string}T00:00:00.000Z`);

      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);

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