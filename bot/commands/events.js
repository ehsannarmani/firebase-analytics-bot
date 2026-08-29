import { InlineKeyboard } from "grammy";
import {
    getAllEvents,
    getEventParameterBreakdown,
    getMultiParamBreakdown,
    getCustomDimensions,
    runMultiAccountExecution
} from '../services/analytics.js';
import { resolveTargetAccounts, normalizeSlug } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';

export function setupEventsCommand(bot) {
    bot.command("events", async (ctx) => {
        const rawArgs = (ctx.match || "").trim().split(/\s+/).filter(Boolean);

        let projectArg = "";
        let commandArgs = [...rawArgs];

        if (rawArgs.length > 0) {
            // Check if first arg matches a project name/slug
            const repo = new FirebaseAccountRepository(ctx.env);
            let allAccounts = [];
            try {
                allAccounts = await repo.getAll();
            } catch (e) {}

            const firstArgSlug = normalizeSlug(rawArgs[0]);
            const isProjectMatch = allAccounts.some(a =>
                normalizeSlug(a.name) === firstArgSlug ||
                normalizeSlug(a.id) === firstArgSlug ||
                normalizeSlug(a.name).includes(firstArgSlug)
            );

            if (isProjectMatch) {
                projectArg = rawArgs[0];
                commandArgs = rawArgs.slice(1);
            }
        }

        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, projectArg);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        // Case 1: /events or /events <project> -> List top events
        if (commandArgs.length === 0) {
            const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all projects";
            const loadingMessage = await ctx.reply(`Getting events report for ${scopeLabel}...`, { parse_mode: "HTML" });

            try {
                const results = await runMultiAccountExecution(accounts, async (account) => {
                    return await getAllEvents(account);
                });

                let finalMessage = `📊 <b>Events Report (Last 7 Days)</b>\n`;
                let successfulCount = 0;

                for (const res of results) {
                    finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
                    finalMessage += `🔥 <b>${res.account.name}</b>\n\n`;

                    if (res.success && res.data && res.data.length > 0) {
                        successfulCount++;
                        const events = res.data;
                        const totalCount = events.reduce((s, e) => s + e.count, 0);

                        finalMessage += `Total: <code>${formatNumber(totalCount)}</code> events\n\n`;

                        const msg = events.slice(0, 10)
                            .map((e, i) => {
                                const bar = generateBar(parseFloat(e.percentage));
                                return `${i + 1}. <code>${e.eventName}</code>\n   ${bar} <b>${e.percentage}%</b> (${formatNumber(e.count)})`;
                            })
                            .join("\n\n");

                        finalMessage += msg + "\n";
                    } else if (res.success && (!res.data || res.data.length === 0)) {
                        finalMessage += `<i>📭 No events recorded in the last 7 days.</i>\n`;
                    } else {
                        finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
                    }
                }

                const footer = `\n<i>💡 Drill down into parameters:\n/events [project] event_name param_name\n/events [project] event_name param1 param2</i>`;

                let replyMarkup = undefined;
                if (successfulCount > 0) {
                    const reportId = await saveReportContext(ctx.env, 'events', results, { isFiltered, projectName: matchedName });
                    replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
                }

                await ctx.reply(finalMessage + footer, { parse_mode: 'HTML', reply_markup: replyMarkup });
            } catch (error) {
                console.error('Error fetching events:', error);
                await ctx.reply("❌ Failed to fetch events report. Please try again later.");
            } finally {
                try {
                    await ctx.deleteMessages([loadingMessage.message_id]);
                } catch (e) {}
            }
            return;
        }

        const eventName = commandArgs[0];

        // Case 3: 3+ args: /events [project] stage_completed stage_id duration_seconds
        if (commandArgs.length >= 3) {
            const primaryParam = commandArgs[1];
            const secondaryParam = commandArgs[2];
            await showMultiParamBreakdownMultiAccount(ctx, accounts, eventName, primaryParam, secondaryParam);
            return;
        }

        // Case 2: 2 args: /events [project] stage_completed stage_id
        if (commandArgs.length === 2) {
            const paramName = commandArgs[1];
            await showSingleParamBreakdownMultiAccount(ctx, accounts, eventName, paramName);
            return;
        }

        // Case 4: 1 arg: /events [project] stage_completed -> Auto discover parameters
        const loadingMessage = await ctx.reply(`Analyzing parameters for <code>${eventName}</code> across projects...`, { parse_mode: 'HTML' });
        try {
            let finalMessage = `📊 <b>${eventName}</b> — Parameter Analysis (Last 7 Days)\n`;

            for (const account of accounts) {
                finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
                finalMessage += `🔥 <b>${account.name}</b>\n`;

                let dimensions = [];
                try {
                    dimensions = await getCustomDimensions(account);
                } catch (err) {
                    // Ignore admin api error
                }

                const paramList = dimensions.map(d => ({ paramName: d.paramName, displayName: d.displayName }));
                const fallbackParams = ['stage_id', 'p', 'duration_seconds', 'hints_used_count', 'difficulty', 'chapter', 'id', 'value', 'level', 'status', 'type'];
                for (const fallback of fallbackParams) {
                    if (!paramList.some(p => p.paramName.toLowerCase() === fallback.toLowerCase())) {
                        paramList.push({ paramName: fallback, displayName: fallback });
                    }
                }

                const results = [];
                for (const param of paramList) {
                    try {
                        const result = await getEventParameterBreakdown(eventName, param.paramName, account);
                        const meaningful = result.values.filter(v => v.value !== '(not set)');
                        if (meaningful.length > 0) {
                            results.push({ ...result, values: meaningful, displayName: param.displayName });
                        }
                    } catch (err) {
                        // Ignore
                    }
                }

                if (results.length === 0) {
                    finalMessage += `<i>No custom dimension data found for this project.</i>\n`;
                    continue;
                }

                for (const result of results.slice(0, 3)) {
                    const totalCount = result.values.reduce((s, v) => s + v.count, 0);
                    finalMessage += `\n🏷 <b>${result.displayName || result.paramName}</b> (<code>${result.paramName}</code> - Total: ${formatNumber(totalCount)})\n`;

                    for (const v of result.values.slice(0, 5)) {
                        const pct = ((v.count / totalCount) * 100).toFixed(1);
                        const bar = generateBar(parseFloat(pct));
                        finalMessage += `<code>${v.value}</code>\n${bar} <b>${pct}%</b> (${formatNumber(v.count)})\n`;
                    }
                }
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error analyzing event parameters:', error);
            await ctx.reply("❌ Failed to analyze event parameters. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}

async function showMultiParamBreakdownMultiAccount(ctx, accounts, eventName, primaryParam, secondaryParam) {
    const loadingMessage = await ctx.reply(`Analyzing <code>${eventName}</code> by <code>${primaryParam}</code> ➔ <code>${secondaryParam}</code>...`, { parse_mode: 'HTML' });
    try {
        let finalMessage = `📊 <b>${eventName}</b>\nBreakdown: <b>${primaryParam}</b> ➔ <b>${secondaryParam}</b>\n`;

        for (const account of accounts) {
            finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
            finalMessage += `🔥 <b>${account.name}</b>\n`;

            try {
                const result = await getMultiParamBreakdown(eventName, primaryParam, secondaryParam, account);
                if (!result.groups || result.groups.length === 0) {
                    finalMessage += `<i>No data found.</i>\n`;
                    continue;
                }

                for (const group of result.groups.slice(0, 10)) {
                    finalMessage += `\n📍 <b>${primaryParam}: <code>${group.key}</code></b> (Total: ${formatNumber(group.totalCount)})\n`;
                    const itemText = group.items
                        .map(item => `   • <code>${item.value}</code> 👉 <b>${item.percentage}%</b> (${formatNumber(item.count)})`)
                        .join("\n");
                    finalMessage += itemText + "\n";
                }
            } catch (err) {
                finalMessage += `❌ <i>${err.message}</i>\n`;
            }
        }

        await ctx.reply(finalMessage, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error in multi param breakdown:', error);
        await ctx.reply("❌ Failed to calculate multi-parameter breakdown.");
    } finally {
        try {
            await ctx.deleteMessages([loadingMessage.message_id]);
        } catch (e) {}
    }
}

async function showSingleParamBreakdownMultiAccount(ctx, accounts, eventName, paramName) {
    const loadingMessage = await ctx.reply(`Analyzing <code>${eventName}</code> by parameter <code>${paramName}</code>...`, { parse_mode: 'HTML' });
    try {
        let finalMessage = `📊 <b>${eventName}</b> → param: <b>${paramName}</b>\n`;

        for (const account of accounts) {
            finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
            finalMessage += `🔥 <b>${account.name}</b>\n`;

            try {
                const result = await getEventParameterBreakdown(eventName, paramName, account);
                const validValues = result.values.filter(v => v.value !== '(not set)');

                if (result.totalCount === 0 || validValues.length === 0) {
                    finalMessage += `<i>No data found for this parameter.</i>\n`;
                    continue;
                }

                finalMessage += `Total: <code>${formatNumber(result.totalCount)}</code> events\n\n`;
                const msg = validValues.slice(0, 10)
                    .map(v => {
                        const bar = generateBar(parseFloat(v.percentage));
                        return `<code>${v.value}</code>\n${bar} <b>${v.percentage}%</b> (${formatNumber(v.count)})`;
                    })
                    .join("\n\n");

                finalMessage += msg + "\n";
            } catch (err) {
                finalMessage += `❌ <i>${err.message}</i>\n`;
            }
        }

        await ctx.reply(finalMessage, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error fetching event parameter breakdown:', error);
        await ctx.reply("❌ Failed to fetch event parameter breakdown.");
    } finally {
        try {
            await ctx.deleteMessages([loadingMessage.message_id]);
        } catch (e) {}
    }
}

function generateBar(percentage) {
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

function formatNumber(num) {
    return num.toLocaleString('en-US');
}
