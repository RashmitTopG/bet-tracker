import { createClient } from "redis";
import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } from "./utlis.js";

export const redisClient = createClient({
    username: 'default',
    password: `${REDIS_PASSWORD}`,
    socket: {
        host: REDIS_HOST,
        port: REDIS_PORT
    }
});

redisClient.on("error", (e) => {
    console.log(`Redis Client Error `, e)
})

export const connectRedis = async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log("Redis Connected Successfully");
    }
}

