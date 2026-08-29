export function setupHelpCommand(bot) {
    bot.command("help", async (ctx) => {
        const helpText = `<b>🤖 Firebase Analytics Bot - Command Guide</b>

<b>🎛 Executive Multi-Project Dashboard:</b>
• /dashboard (or <code>/overview</code>) - Executive multi-project summary with aggregated global KPIs, per-app traffic breakdown, and comparative charts.

<b>📊 Analytics Reports (Supports Optional Project & Duration Filters):</b>
All analytics commands can be run for <b>all projects</b> or a <b>single project</b> with custom timeframes.

• /projects <code>[project]</code> - Inspect project metadata, data streams, and live metrics.
• /compare <code>[project] [days]</code> - Compare metrics (current period vs previous period, e.g. <code>/compare 14d</code> or <code>/compare zino</code>).
• /daily <code>[project] [days]</code> - Active users report with DoD growth (e.g. <code>/daily 30d</code>, <code>/daily zino 14d</code>).
• /new_users <code>[project] [days]</code> - New users report with growth % (e.g. <code>/new_users 30d</code>).
• /min30 <code>[project]</code> - Active users count in the last 30 minutes.
• /users <code>[project]</code> - Total lifetime users count.
• /versions <code>[project]</code> - Active users over the last 7 days grouped by app version.
• /countries <code>[project] [codes...]</code> - Total lifetime users grouped by country.
• /engagement <code>[project]</code> - Average engagement time &amp; rate.
• /events <code>[project] [event] [param]</code> - List top events or parameter drill-down.

<b>📈 Interactive Visual Charts:</b>
Every report includes an inline <b>[📈 View as Chart]</b> button to render high-definition visual charts and dual-period overlays directly in Telegram.

<b>🚨 Proactive Traffic Monitoring:</b>
The bot continuously monitors active traffic and automatically sends spike (🟢 <code>+40%</code>) and drop (🔴 <code>-40%</code>) alerts when unusual anomalies occur.

<b>🛜 Live Updates:</b>
• /live <code>[project]</code> - Active users count for the last 30 minutes.
• /stop - Stop live update (reply <code>/stop</code> to a live message).

<b>⚙️ Admin & Management (Admins Only):</b>
• /admin - Open the interactive <b>Admin Control Panel</b> (Firebase accounts, Authorized Chats, Report Channel).
• /migrate - Import legacy single-project environment variables into D1.
• /cancel - Cancel an active admin input flow.

<b>ℹ️ General Commands:</b>
• /start - Welcome message and quick start list.
• /help - View this detailed guide.`;

        await ctx.reply(helpText, { parse_mode: 'HTML' });
    });
}
