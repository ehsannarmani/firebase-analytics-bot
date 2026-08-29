import { getAllEvents, getEventParameterBreakdown, getMultiParamBreakdown, getCustomDimensions } from '../services/analytics.js';

export function setupEventsCommand(bot) {
    bot.command("events", async (ctx) => {
        const args = (ctx.match || "").trim().split(/\s+/).filter(Boolean);

        // Case 1: /events -> List top events
        if (args.length === 0) {
            const loadingMessage = await ctx.reply("Getting events report...");
            try {
                const events = await getAllEvents(ctx.env);
                if (events.length === 0) {
                    await ctx.reply("📭 No events found in the last 7 days.");
                    return;
                }
                const msg = events
                    .map((e, i) => {
                        const bar = generateBar(parseFloat(e.percentage));
                        return `${i + 1}. <code>${e.eventName}</code>\n   ${bar} <b>${e.percentage}%</b> (${formatNumber(e.count)})`;
                    })
                    .join("\n\n");

                const totalCount = events.reduce((s, e) => s + e.count, 0);
                const header = `📊 <b>Events Report (last 7 days)</b>\nTotal: <code>${formatNumber(totalCount)}</code> events\n\n`;
                const footer = `\n\n<i>💡 Usage:\n/events event_name param_name\n/events event_name param1 param2</i>`;

                await ctx.reply(`${header}${msg}${footer}`, { parse_mode: 'HTML' });
            } catch (error) {
                console.error('Error fetching events:', error);
                await ctx.reply("❌ Failed to fetch events report. Please try again later.");
            } finally {
                await ctx.deleteMessages([loadingMessage.message_id]);
            }
            return;
        }

        const eventName = args[0];

        // Case 3: 3+ args or 3 parameters: /events stage_completed stage_id duration_seconds
        if (args.length >= 3) {
            const primaryParam = args[1];
            const secondaryParam = args[2];
            await showMultiParamBreakdown(ctx, eventName, primaryParam, secondaryParam);
            return;
        }

        // Case 2: 2 args: /events stage_completed stage_id OR /events stage_completed duration_seconds
        if (args.length === 2) {
            const paramName = args[1];

            // If param is a common secondary metric (e.g. duration_seconds or hints_used_count), and user didn't specify primary key like stage_id,
            // we offer a two-dimension breakdown recommendation!
            await showSingleParamBreakdown(ctx, eventName, paramName);
            return;
        }

        // Case 4: 1 arg: /events stage_completed -> Auto discover parameters
        const loadingMessage = await ctx.reply(`Analyzing parameters for <code>${eventName}</code>...`, { parse_mode: 'HTML' });
        try {
            let dimensions = [];
            try {
                dimensions = await getCustomDimensions(ctx.env);
            } catch (err) {
                console.error('Error fetching custom dimensions from Admin API:', err);
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
                    const result = await getEventParameterBreakdown(eventName, param.paramName, ctx.env);
                    const meaningful = result.values.filter(v => v.value !== '(not set)');
                    if (meaningful.length > 0) {
                        results.push({ ...result, values: meaningful, displayName: param.displayName });
                    }
                } catch (err) {
                    // Ignore dimension error
                }
            }

            if (results.length === 0) {
                await ctx.reply(
                    `📭 No registered custom dimension data found for <code>${eventName}</code>.\n\n` +
                    `<b>How to analyze this event:</b>\n` +
                    `1. Query 2 parameters grouped together (e.g., <b>stage_id</b> and <b>duration_seconds</b>):\n` +
                    `   <code>/events ${eventName} stage_id duration_seconds</code>\n\n` +
                    `2. Or query a parameter directly:\n` +
                    `   <code>/events ${eventName} stage_id</code>\n\n` +
                    `<i>Note: Parameters must be registered as Custom Dimensions in GA4 (Admin ⚙️ ➔ Custom definitions).</i>`,
                    { parse_mode: 'HTML' }
                );
                return;
            }

            let msg = `📊 <b>${eventName}</b> — Parameter Analysis (last 7 days)\n`;

            for (const result of results) {
                const totalCount = result.values.reduce((s, v) => s + v.count, 0);
                msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
                msg += `🏷 <b>${result.displayName || result.paramName}</b> (<code>${result.paramName}</code>)\n`;
                msg += `Total: <code>${formatNumber(totalCount)}</code>\n\n`;

                for (const v of result.values.slice(0, 10)) {
                    const pct = ((v.count / totalCount) * 100).toFixed(1);
                    const bar = generateBar(parseFloat(pct));
                    msg += `<code>${v.value}</code>\n${bar} <b>${pct}%</b> (${formatNumber(v.count)})\n`;
                }

                if (result.values.length > 10) {
                    msg += `<i>... and ${result.values.length - 10} more values</i>\n`;
                }
            }

            await ctx.reply(msg, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error analyzing event parameters:', error);
            await ctx.reply("❌ Failed to analyze event parameters. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}

async function showMultiParamBreakdown(ctx, eventName, primaryParam, secondaryParam) {
    const loadingMessage = await ctx.reply(`Analyzing <code>${eventName}</code> by <code>${primaryParam}</code> ➔ <code>${secondaryParam}</code>...`, { parse_mode: 'HTML' });
    try {
        const result = await getMultiParamBreakdown(eventName, primaryParam, secondaryParam, ctx.env);

        if (!result.groups || result.groups.length === 0) {
            await ctx.reply(
                `📭 No data found for <code>${eventName}</code> with parameters <code>${primaryParam}</code> and <code>${secondaryParam}</code>.\n\n` +
                `<i>Ensure both <code>${primaryParam}</code> and <code>${secondaryParam}</code> are registered as Custom Dimensions in GA4.</i>`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        let msg = `📊 <b>${eventName}</b>\nBreakdown: <b>${primaryParam}</b> ➔ <b>${secondaryParam}</b> (last 7 days)\n`;

        for (const group of result.groups.slice(0, 15)) {
            msg += `\n📍 <b>${primaryParam}: <code>${group.key}</code></b> (Total: ${formatNumber(group.totalCount)})\n`;

            const itemText = group.items
                .map(item => `   • <code>${item.value}</code> 👉 <b>${item.percentage}%</b> (${formatNumber(item.count)})`)
                .join("\n");

            msg += itemText + "\n";
        }

        await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error in multi param breakdown:', error);
        await ctx.reply("❌ Failed to calculate multi-parameter breakdown. Ensure parameters are registered as Custom Dimensions in GA4.");
    } finally {
        await ctx.deleteMessages([loadingMessage.message_id]);
    }
}

async function showSingleParamBreakdown(ctx, eventName, paramName) {
    const loadingMessage = await ctx.reply(`Analyzing <code>${eventName}</code> by parameter <code>${paramName}</code>...`, { parse_mode: 'HTML' });
    try {
        const result = await getEventParameterBreakdown(eventName, paramName, ctx.env);

        if (result.totalCount === 0 || result.values.length === 0) {
            await ctx.reply(
                `📭 No data found for event <code>${eventName}</code> with parameter <code>${paramName}</code>.\n\n` +
                `<i>Ensure <code>${paramName}</code> is registered as a Custom Dimension in GA4 (Admin ⚙️ ➔ Custom definitions).</i>`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        // Check if values are all (not set)
        const validValues = result.values.filter(v => v.value !== '(not set)');
        if (validValues.length === 0) {
            await ctx.reply(
                `⚠️ Parameter <code>${paramName}</code> returned <b>(not set)</b>.\n\n` +
                `<b>Possible Reasons:</b>\n` +
                `1. Custom dimension <code>${paramName}</code> was created recently and needs 24h for GA4 to backfill.\n` +
                `2. Try grouping by stage_id first:\n` +
                `   <code>/events ${eventName} stage_id ${paramName}</code>`,
                { parse_mode: 'HTML' }
            );
            return;
        }

        const msg = validValues
            .map(v => {
                const bar = generateBar(parseFloat(v.percentage));
                return `<code>${v.value}</code>\n${bar} <b>${v.percentage}%</b> (${formatNumber(v.count)})`;
            })
            .join("\n\n");

        const header = `📊 <b>${eventName}</b> → param: <b>${paramName}</b>\nTotal: <code>${formatNumber(result.totalCount)}</code> events (last 7 days)\n\n`;
        const tip = `\n\n💡 <i>Tip: Group by stage_id:</i>\n<code>/events ${eventName} stage_id ${paramName}</code>`;

        await ctx.reply(`${header}${msg}${tip}`, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error fetching event parameter breakdown:', error);
        await ctx.reply("❌ Failed to fetch event parameter breakdown.");
    } finally {
        await ctx.deleteMessages([loadingMessage.message_id]);
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
