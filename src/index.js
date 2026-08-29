import { webhookCallback } from "grammy";
import { createBot } from "../bot/bot.js";
import { sendMin30Update, sendDailyUpdate } from "../bot/services/scheduler.js";
import { getLifetimeActiveUsers, getActiveUsersLast30Minutes, getAccountsForExecution } from "../bot/services/analytics.js";
import { FirebaseAccountRepository } from "../bot/db/accountRepository.js";
import { SettingsRepository } from "../bot/db/settingsRepository.js";

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Comprehensive Health Check Endpoint: GET /health or GET /status or GET /
        if (request.method === "GET") {
            let dbConnected = false;
            let accountsCount = { total: 0, enabled: 0 };
            let channelConfig = { channelId: null, source: 'none' };

            try {
                const repo = new FirebaseAccountRepository(env);
                accountsCount = await repo.count();
                const settingsRepo = new SettingsRepository(env);
                channelConfig = await settingsRepo.getUpdateChannelId(env);
                dbConnected = true;
            } catch (e) {
                console.error("Database check failed:", e);
            }

            const checks = {
                bot_token: Boolean(env?.BOT_TOKEN || process.env?.BOT_TOKEN),
                main_admin_configured: Boolean(env?.MAIN_ADMIN_CHAT_ID || process.env?.MAIN_ADMIN_CHAT_ID),
                update_channel_id: channelConfig.channelId ? { configured: true, id: channelConfig.channelId, source: channelConfig.source } : { configured: false },
                authorized_chats: Boolean(env?.AUTHORIZED_CHATS || process.env?.AUTHORIZED_CHATS),
                secret_token: Boolean(env?.SECRET_TOKEN || env?.TELEGRAM_SECRET_TOKEN),
                database_connected: dbConnected,
                accounts_count: accountsCount,
                google_analytics_api: {
                    ok: false,
                    accounts_tested: 0,
                    error: null,
                }
            };

            let isOk = checks.bot_token && checks.database_connected;

            if (isOk) {
                try {
                    const accounts = await getAccountsForExecution(env);
                    checks.google_analytics_api.accounts_tested = accounts.length;

                    if (accounts.length > 0) {
                        // Test first enabled account
                        await getActiveUsersLast30Minutes(accounts[0]);
                        checks.google_analytics_api.ok = true;
                    } else {
                        checks.google_analytics_api.ok = true;
                        checks.google_analytics_api.note = "No Firebase accounts added yet. Use /admin to connect projects.";
                    }
                } catch (err) {
                    checks.google_analytics_api.ok = false;
                    checks.google_analytics_api.error = err.message;
                }
            }

            const statusCode = isOk ? 200 : 500;
            return new Response(JSON.stringify({
                status: isOk ? "ok" : "error",
                message: isOk
                    ? "Firebase Analytics Bot Worker is healthy! 🚀"
                    : "Health check warning. Check environment variables or database connection.",
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

        return new Response("Method Not Allowed", { status: 405 });
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
