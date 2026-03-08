
import mongoose, { Schema } from "mongoose";
console.log("MongoDB connected");

const betSchema = new Schema({
  betId: {
    type: String,
    unique: true,
    index: true
  },
  date: Date,
  eventType: String,
  event: String,
  amount: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const profitSchema = new Schema({
  date: Date,
  profit: Number,
  totalBets: Number
});

const balanceSchema = new Schema({
  date: Date,
  balance: Number
});

export const Bets = mongoose.model("bets", betSchema);
export const Profit = mongoose.model("profit", profitSchema);
export const Balance = mongoose.model("balance", balanceSchema);