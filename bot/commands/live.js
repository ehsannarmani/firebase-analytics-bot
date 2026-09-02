import { InlineKeyboard } from "grammy";
import { getActiveUsersLast30Minutes, runMultiAccountExecution, getAccountsForExecution } from '../services/analytics.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { buildRefreshCallback } from './refreshCallback.js';

export const subscribedMessages = new Set();
let updateInterval = null;

/**
 * Pure report generator for Live Active Users (shared between command and refresh callback).
 */
export async function generateLiveReport(env, { projectArg = "" } = {}) {
    const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts({ env }, projectArg);
    if (error) {
        return { text: error, keyboard: undefined, error };
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return await getActiveUsersLast30Minutes(account);
    });

    let msg = `🛜 <b>Live Active Users Update (Last 30 Min)</b>\n`;
    let total = 0;
    let successfulCount = 0;

    for (const res of results) {
        msg += `\n━━━━━━━━━━━━━━━━━━\n`;
        msg += `🔥 <b>${res.account.name}</b>\n`;
        if (res.success) {
            msg += `Active users: <code>${res.data}</code>\n`;
            total += Number(res.data) || 0;
            successfulCount++;
        } else {
            msg += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    if (results.length > 1 && successfulCount > 0) {
        msg += `\n━━━━━━━━━━━━━━━━━━\n`;
        msg += `📈 <b>Total Active Users:</b> <code>${total}</code>\n`;
    }

    msg += `\n⏳ <i>Updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();
    const refreshCb = buildRefreshCallback('live', { projectArg });
    keyboard.text("🔄 Refresh", refreshCb);

    return { text: msg, keyboard, results, successfulCount, accounts };
}

export function setupLiveCommand(bot) {
    bot.command("live", async (ctx) => {
        const projectArg = (ctx.match || "").trim();

        try {
            const report = await generateLiveReport(ctx.env, { projectArg });
            const message = await ctx.reply(report.text, { parse_mode: 'HTML', reply_markup: report.keyboard });

            // In Node.js environment, enable periodic interval updating
            if (typeof process !== 'undefined' && process.release?.name === 'node' && report.accounts) {
                if (subscribedMessages.size === 0) {
                    startUpdate(bot, 60, ctx.env, report.accounts, projectArg);
                }
                subscribedMessages.add({ messageId: message.message_id, chatId: message.chat.id, accounts: report.accounts, projectArg });
            }
        } catch (e) {
            console.error("Error in live command:", e);
            await ctx.reply("❌ Failed to fetch live analytics data.");
        }
    });
}

function startUpdate(bot, duration, env, accounts, projectArg) {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(async function () {
        try {
            for (const item of subscribedMessages) {
                const report = await generateLiveReport(env, { projectArg: item.projectArg });
                await bot.api.editMessageText(
                    item.chatId,
                    item.messageId,
                    report.text,
                    { parse_mode: 'HTML', reply_markup: report.keyboard }
                );
            }
        } catch (e) {
            console.error("Error updating live messages:", e);
        }
    }, duration * 1000);
}

export function stopLive() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}
