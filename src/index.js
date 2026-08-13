import { webhookCallback } from "grammy";
import { createBot } from "../bot/bot.js";
import { sendMin30Update, sendDailyUpdate } from "../bot/services/scheduler.js";
import { getLifetimeActiveUsers, getActiveUsersLast30Minutes } from "../bot/services/analytics.js";

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Comprehensive Health Check Endpoint: GET /health or GET /status or GET /
        if (request.method === "GET") {
            const checks = {
                bot_token: Boolean(env?.BOT_TOKEN || process.env?.BOT_TOKEN),
                property_id: Boolean(env?.PROPERTY_ID || process.env?.PROPERTY_ID),
                update_channel_id: Boolean(env?.UPDATE_CHANNEL_ID || process.env?.UPDATE_CHANNEL_ID),
                authorized_chats: Boolean(env?.AUTHORIZED_CHATS || process.env?.AUTHORIZED_CHATS),
                secret_token: Boolean(env?.SECRET_TOKEN || env?.TELEGRAM_SECRET_TOKEN),
                service_account: Boolean(
                    env?.SERVICE_ACCOUNT_JSON ||
                    (env?.SERVICE_ACCOUNT_CLIENT_EMAIL && env?.SERVICE_ACCOUNT_PRIVATE_KEY) ||
                    env?.SERVICE_ACCOUNT_PATH
                ),
                google_analytics_api: {
                    ok: false,
                    lifetime_users: null,
                    active_users_30min: null,
                    error: null,
                }
            };

            let isOk = checks.bot_token && checks.property_id && checks.service_account;

            if (isOk) {
                try {
                    const lifetimeUsers = await getLifetimeActiveUsers(env);
                    checks.google_analytics_api.lifetime_users = lifetimeUsers;

                    try {
                        const min30Users = await getActiveUsersLast30Minutes(env);
                        checks.google_analytics_api.active_users_30min = min30Users;
                    } catch (err) {
                        checks.google_analytics_api.active_users_30min = "N/A or empty";
                    }

                    checks.google_analytics_api.ok = true;
                } catch (err) {
                    isOk = false;
                    checks.google_analytics_api.ok = false;
                    checks.google_analytics_api.error = err.message;
                }
            }

            const statusCode = isOk ? 200 : 500;
            return new Response(JSON.stringify({
                status: isOk ? "ok" : "error",
                message: isOk
                    ? "Firebase Analytics Bot Worker is healthy and Google Analytics API is working! 🚀"
                    : "Health check failed. Check environment variables or Service Account permissions.",
                checks,
                timestamp: new Date().toISOString(),
            }, null, 2), {
                status: statusCode,
                headers: { "Content-Type": "application/json; charset=utf-8" },
            });
        }

        // Webhook handler (POST)
        if (request.method === "POST") {
            const botToken = env?.BOT_TOKEN || (typeof process !== 'undefined' ? process.env?.BOT_TOKEN : undefined);
            if (!botToken) {
                return new Response("BOT_TOKEN is not configured", { status: 500 });
            }

            const secretToken = env?.SECRET_TOKEN || env?.TELEGRAM_SECRET_TOKEN;
            if (secretToken) {
                const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
                if (headerSecret !== secretToken) {
                    return new Response("Unauthorized secret token", { status: 403 });
                }
            }

            try {
                const bot = createBot(botToken, env);
                const handleUpdate = webhookCallback(bot, "cloudflare-mod");
                return await handleUpdate(request);
            } catch (err) {
                console.error("Error processing update:", err);
                return new Response(`Error processing webhook update: ${err.message}`, { status: 500 });
            }
        }

        return new Response("Method Not Allowed", { status: 450 });
    },

    async scheduled(event, env, ctx) {
        const botToken = env?.BOT_TOKEN || (typeof process !== 'undefined' ? process.env?.BOT_TOKEN : undefined);
        if (!botToken) {
            console.error("BOT_TOKEN is missing in scheduled event");
            return;
        }

        const bot = createBot(botToken, env);

        if (event.cron === "0 */4 * * *") {
            ctx.waitUntil(sendDailyUpdate(bot, env));
        } else {
            ctx.waitUntil(sendMin30Update(bot, env));
        }
    }
};
