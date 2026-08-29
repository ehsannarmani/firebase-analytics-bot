export function setupHelpCommand(bot) {
    bot.command("help", async (ctx) => {
        const helpText = `<b>🤖 Firebase Analytics Bot - Command Guide</b>

<b>📊 Analytics Reports:</b>
• /daily - Active users over the last 7 days with day-over-day growth %.
• /new_users - New users report over the last 7 days with growth %.
• /min30 - Active users count in the last 30 minutes.
• /users - Total lifetime users count.
• /versions - Active users over the last 7 days grouped by app version.
• /countries - Total lifetime users grouped by country.
  <i>Tip: Filter specific countries, e.g.:</i> <code>/countries US UK CA DE</code>
• /engagement - Average engagement time &amp; rate over the last 7 days.
• /events - List all events with counts (last 7 days).
  <i>Drill into params:</i> <code>/events event_name param_name</code>

<b>🛜 Live Updates:</b>
• /live - Active users count for the last 30 minutes.
• /stop - Stop live update (reply <code>/stop</code> to a live message).

<b>⚙️ General Commands:</b>
• /start - Welcome message and quick start list.
• /help - View this detailed guide.`;

        await ctx.reply(helpText, { parse_mode: 'HTML' });
    });
}
