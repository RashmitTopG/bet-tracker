import { TELEGRAM_BOT_TOKEN } from "./utlis.js";
import { TELEGRAM_CHAT_ID } from "./utlis.js";
import axios from "axios";

export const sendMessage = async (message: string) => {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    }, { timeout: 5000 });
  } catch (error) {
    console.error("Failed to send Telegram message:", error);
  }
};