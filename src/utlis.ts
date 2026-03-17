import dotenv from "dotenv"
await dotenv.config()

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = Number(process.env.REDIS_PORT);

export async function withRetry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delayMs: number = 2000,
    context: string = "Operation"
): Promise<T> {
    let lastError: any;
    for (let i = 1; i <= retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            console.error(`${context} - Attempt ${i} failed: ${error.message}`);
            if (i < retries) {
                console.log(`Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    console.error(`${context} failed after ${retries} attempts.`);
    throw lastError;
}