import { getAverageEngagementTime } from '../services/analytics.js';

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

export function setupEngagementCommand(bot) {
    bot.command("engagement", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting engagement time report...");
        try {
            const report = (await getAverageEngagementTime(ctx.env)).reverse();
            const msg = report
                .map(day => {
                    const rate = (day.engagementRate * 100).toFixed(1);
                    let result = `📍 <code>${day.date}</code> ⏱ <code>${formatDuration(day.avgSessionDuration)}</code> 📈 <code>${rate}%</code>`;
                    if (day.grow) {
                        if (day.grow < 0) {
                            result += ` 🔴 <code>${day.grow}%</code>`;
                        } else {
                            result += ` 🟢 <code>+${day.grow}%</code>`;
                        }
                    }
                    return result;
                })
                .join("\n");

            const header = `⏱ Avg Engagement Time (last 7 days):\n<i>Date | Avg Duration | Engagement Rate</i>\n\n`;
            await ctx.reply(`${header}${msg}`, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error fetching engagement time:', error);
            await ctx.reply("❌ Failed to fetch engagement time report. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}
