import { InlineKeyboard } from "grammy";
import {
    getActiveUsersLast30Minutes,
    getLifetimeActiveUsers,
    getDailyActiveUsers,
    getAccountsForExecution,
    runMultiAccountExecution
} from '../services/analytics.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { saveReportContext } from '../services/reportCache.js';

/**
 * Builds the executive dashboard report text and keyboard (optimized for mobile screens).
 */
export async function buildDashboardData(env) {
    const repo = new FirebaseAccountRepository(env);
    let accounts = [];

    try {
        accounts = await repo.getEnabled();
    } catch (e) {
        accounts = await getAccountsForExecution(env);
    }

    if (!accounts || accounts.length === 0) {
        return {
            text: "📭 <b>No enabled Firebase projects found.</b>\n\nUse /admin to add your first project.",
            keyboard: new InlineKeyboard().text("⚙️ Open Admin Panel", "admin:main"),
            hasData: false,
        };
    }

    // Execute queries across all projects in parallel
    const results = await runMultiAccountExecution(accounts, async (account) => {
        const [active30m, lifetime, dailyActive, dailyNew] = await Promise.all([
            getActiveUsersLast30Minutes(account).catch(() => 0),
            getLifetimeActiveUsers(account).catch(() => 0),
            getDailyActiveUsers('activeUsers', account, 7).catch(() => []),
            getDailyActiveUsers('newUsers', account, 7).catch(() => []),
        ]);

        const todayActiveItem = dailyActive && dailyActive.length > 0 ? dailyActive[dailyActive.length - 1] : null;
        const todayNewItem = dailyNew && dailyNew.length > 0 ? dailyNew[dailyNew.length - 1] : null;

        return {
            active30m: Number(active30m) || 0,
            lifetimeUsers: Number(lifetime) || 0,
            todayActive: Number(todayActiveItem?.users) || 0,
            todayGrow: todayActiveItem?.grow || null,
            todayNewUsers: Number(todayNewItem?.users) || 0,
            sevenDayTotal: (dailyActive || []).reduce((s, d) => s + (Number(d.users) || 0), 0),
        };
    });

    // Aggregate global metrics
    let total30m = 0;
    let totalTodayActive = 0;
    let totalTodayNew = 0;
    let totalLifetime = 0;
    let total7Day = 0;
    let successfulCount = 0;

    for (const res of results) {
        if (res.success && res.data) {
            successfulCount++;
            total30m += res.data.active30m;
            totalTodayActive += res.data.todayActive;
            totalTodayNew += res.data.todayNewUsers;
            totalLifetime += res.data.lifetimeUsers;
            total7Day += res.data.sevenDayTotal;
        }
    }

    let text = `🎛 <b>EXECUTIVE ANALYTICS DASHBOARD</b>\n` +
               `<i>Live Consolidated Overview across ${accounts.length} Connected Project${accounts.length > 1 ? 's' : ''}</i>\n\n` +
               `<b>📊 Combined Global Totals:</b>\n` +
               `• ⚡️ <b>Realtime (Last 30m):</b> <code>${total30m.toLocaleString()}</code> active users\n` +
               `• 👥 <b>Today Active Users:</b> <code>${totalTodayActive.toLocaleString()}</code>\n` +
               `• ✨ <b>Today New Users:</b> <code>${totalTodayNew.toLocaleString()}</code>\n` +
               `• 🙌 <b>Total Lifetime Users:</b> <code>${totalLifetime.toLocaleString()}</code>\n\n` +
               `━━━━━━━━━━━━━━━━━━\n` +
               `<b>📱 Projects Breakdown:</b>\n\n`;

    for (const res of results) {
        text += `🔥 <b>${res.account.name}</b>\n`;
        if (res.success && res.data) {
            const d = res.data;
            const share = totalTodayActive > 0 ? ((d.todayActive / totalTodayActive) * 100).toFixed(1) : "0.0";
            const growBadge = d.todayGrow
                ? (d.todayGrow < 0 ? ` (🔴 <code>${d.todayGrow}%</code>)` : ` (🟢 <code>+${d.todayGrow}%</code>)`)
                : '';

            text += `• ⚡️ 30m: <code>${d.active30m.toLocaleString()}</code> | 👥 Today: <code>${d.todayActive.toLocaleString()}</code>${growBadge}\n` +
                   `• ✨ New: <code>${d.todayNewUsers.toLocaleString()}</code> | 🙌 Lifetime: <code>${d.lifetimeUsers.toLocaleString()}</code>\n` +
                   `• 📊 Today Traffic Share: <code>${share}%</code>\n\n`;
        } else {
            text += `❌ <i>Failed to retrieve live statistics</i>\n\n`;
        }
    }

    text += `⏳ <i>Snapshot updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();

    if (successfulCount > 0) {
        const reportId = await saveReportContext(env, 'dashboard', results, { isFiltered: false });
        keyboard.text("📈 View Dashboard Chart", `chart:${reportId}`).row();
    }

    keyboard
        .text("🔄 Refresh", "dash:refresh")
        .text("📊 /compare", "dash:compare")
        .row()
        .text("🔍 Inspect Projects", "proj:list")
        .text("⚙️ Admin Panel", "admin:main");

    return { text, keyboard, hasData: true };
}

export function setupDashboardCommand(bot) {
    bot.command(["dashboard", "dash", "overview"], async (ctx) => {
        const loadingMsg = await ctx.reply("🎛 <i>Generating Executive Dashboard overview...</i>", { parse_mode: "HTML" });

        try {
            const { text, keyboard } = await buildDashboardData(ctx.env);
            await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (error) {
            console.error("Error generating dashboard:", error);
            await ctx.reply("❌ Failed to generate dashboard. Please try again later.");
        } finally {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            } catch (e) {}
        }
    });

    bot.on("callback_query:data", async (ctx, next) => {
        const data = ctx.callbackQuery.data;

        if (data === "dash:refresh") {
            try {
                const { text, keyboard } = await buildDashboardData(ctx.env);
                await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
                await ctx.answerCallbackQuery({ text: "✅ Dashboard refreshed!" });
            } catch (e) {
                if (e.message?.includes("message is not modified")) {
                    await ctx.answerCallbackQuery({ text: "✅ Dashboard is already up to date!" });
                } else {
                    await ctx.answerCallbackQuery({ text: "Updated!" });
                }
            }
            return;
        }

        if (data === "dash:compare") {
            await ctx.answerCallbackQuery();
            await ctx.reply("💡 Tip: Use <code>/compare</code> to compare all projects or <code>/compare &lt;project&gt;</code> for a single project.", { parse_mode: "HTML" });
            return;
        }

        return next();
    });
}
