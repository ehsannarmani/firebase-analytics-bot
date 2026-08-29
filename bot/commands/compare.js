import { InlineKeyboard } from "grammy";
import { getPeriodComparison, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts, normalizeSlug } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function formatDelta(deltaStr) {
    const num = parseFloat(deltaStr);
    if (isNaN(num)) return `<code>0%</code>`;
    if (num > 0) return `🟢 <code>+${num}%</code>`;
    if (num < 0) return `🔴 <code>${num}%</code>`;
    return `⚪️ <code>0%</code>`;
}

function padRight(str, len) {
    const s = String(str || "");
    return s + " ".repeat(Math.max(0, len - s.length));
}

function padLeft(str, len) {
    const s = String(str || "");
    return " ".repeat(Math.max(0, len - s.length)) + s;
}

export function setupCompareCommand(bot) {
    bot.command("compare", async (ctx) => {
        const rawTokens = (ctx.match || "").trim().split(/\s+/).filter(Boolean);

        let projectArg = "";
        let days = 7;

        // Parse tokens
        const repo = new FirebaseAccountRepository(ctx.env);
        let allAccounts = [];
        try {
            allAccounts = await repo.getAll();
        } catch (e) {}

        for (const token of rawTokens) {
            const dayMatch = token.match(/^(\d+)(d|days)?$/i);
            if (dayMatch) {
                days = parseInt(dayMatch[1], 10);
                continue;
            }

            const tokenSlug = normalizeSlug(token);
            const isProject = allAccounts.some(a =>
                normalizeSlug(a.name) === tokenSlug ||
                normalizeSlug(a.id) === tokenSlug ||
                normalizeSlug(a.name).includes(tokenSlug)
            );

            if (isProject) {
                projectArg = token;
            } else if (!projectArg) {
                projectArg = token;
            }
        }

        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, projectArg);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Analyzing ${days}-day period comparison for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const results = await runMultiAccountExecution(accounts, async (account) => {
                return await getPeriodComparison(account, days);
            });

            let finalMessage = `📊 <b>Period Comparison (${days}d vs Prev ${days}d)</b>\n\n`;
            let successfulCount = 0;

            for (const res of results) {
                finalMessage += `🔥 <b>${res.account.name}</b>\n`;

                if (res.success && res.data) {
                    successfulCount++;
                    const { current, previous, deltas } = res.data;

                    // Clean comparison table
                    let compTable = "";
                    compTable += `${padRight("Metric", 12)} ${padLeft("Current", 9)} ${padLeft("Prev", 9)} ${padLeft("Delta", 8)}\n`;
                    compTable += `──────────────────────────────────────────\n`;
                    compTable += `${padRight("Active", 12)} ${padLeft(current.activeUsers.toLocaleString(), 9)} ${padLeft(previous.activeUsers.toLocaleString(), 9)} ${padLeft((deltas.activeUsers > 0 ? "+" : "") + deltas.activeUsers + "%", 8)}\n`;
                    compTable += `${padRight("New Users", 12)} ${padLeft(current.newUsers.toLocaleString(), 9)} ${padLeft(previous.newUsers.toLocaleString(), 9)} ${padLeft((deltas.newUsers > 0 ? "+" : "") + deltas.newUsers + "%", 8)}\n`;
                    compTable += `${padRight("Sessions", 12)} ${padLeft(current.sessions.toLocaleString(), 9)} ${padLeft(previous.sessions.toLocaleString(), 9)} ${padLeft((deltas.sessions > 0 ? "+" : "") + deltas.sessions + "%", 8)}\n`;

                    finalMessage += `<pre><code>${compTable}</code></pre>\n` +
                                   `• ⏱ <b>Avg Session:</b> <code>${formatDuration(current.avgDuration)}</code> vs <code>${formatDuration(previous.avgDuration)}</code> (${formatDelta(deltas.avgDuration)})\n\n`;
                } else {
                    finalMessage += `❌ <i>Failed to retrieve comparison statistics</i>\n\n`;
                }
            }

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                const reportId = await saveReportContext(ctx.env, 'compare', results, {
                    isFiltered,
                    projectName: matchedName,
                    periodDays: days,
                });
                replyMarkup = new InlineKeyboard().text("📈 View Comparison Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
        } catch (error) {
            console.error('Error fetching period comparison:', error);
            await ctx.reply("❌ Failed to fetch period comparison. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
