import { InlineKeyboard } from "grammy";
import { FirebaseAccountRepository } from "../db/accountRepository.js";
import { getAccountsForExecution, getProjectDetails } from "../services/analytics.js";
import { resolveTargetAccounts, normalizeSlug } from "../services/projectResolver.js";
import { getFormattedDate } from "../services/dateUtils.js";

/**
 * Builds rich detail view for a single Firebase project.
 */
export async function renderProjectDetailsMessage(account) {
    const details = await getProjectDetails(account);

    const slug = normalizeSlug(details.name);
    let text = `🔥 <b>Firebase Project Profile: ${details.name}</b>\n\n` +
               `🏷 <b>Filter Name / Slug:</b> <code>${slug}</code>\n` +
               `🆔 <b>GA4 Property ID:</b> <code>${details.propertyId}</code>\n`;

    if (details.displayName && details.displayName !== details.name) {
        text += `🏷 <b>GA4 Display Name:</b> ${details.displayName}\n`;
    }

    if (details.timeZone || details.currencyCode) {
        const tz = details.timeZone || 'UTC';
        const curr = details.currencyCode || 'N/A';
        text += `🌐 <b>Property Config:</b> <code>${tz}</code> (${curr})\n`;
    }

    if (details.dataStreams && details.dataStreams.length > 0) {
        text += `\n📱 <b>Connected Platforms & Streams:</b>\n`;
        details.dataStreams.forEach(s => {
            const icon = s.platform === 'ANDROID' ? '🤖 Android' : s.platform === 'IOS' ? '🍎 iOS' : '🌐 Web';
            const idInfo = s.appIdOrUri ? ` - <code>${s.appIdOrUri}</code>` : '';
            text += `• ${icon}: <b>${s.name}</b>${idInfo}\n`;
        });
    }

    text += `\n📊 <b>Live Statistics Snapshot:</b>\n` +
            `• 🟢 <b>Active Users (Last 30 Min):</b> <code>${details.metrics.active30m.toLocaleString()}</code>\n` +
            `• 👥 <b>Today Active Users:</b> <code>${details.metrics.todayActive.toLocaleString()}</code>`;

    if (details.metrics.todayGrow) {
        text += details.metrics.todayGrow < 0
            ? ` (🔴 <code>${details.metrics.todayGrow}%</code>)\n`
            : ` (🟢 <code>+${details.metrics.todayGrow}%</code>)\n`;
    } else {
        text += `\n`;
    }

    text += `• 🙌 <b>Lifetime Active Users:</b> <code>${details.metrics.lifetimeUsers.toLocaleString()}</code>\n`;

    if (details.topEvents && details.topEvents.length > 0) {
        text += `\n⚡️ <b>Top Active Events (Last 7 Days):</b>\n`;
        details.topEvents.slice(0, 3).forEach((e, i) => {
            text += `${i + 1}. <code>${e.eventName}</code> 👉 <b>${e.percentage}%</b> (${e.count.toLocaleString()})\n`;
        });
    }

    text += `\n🕒 <i>Snapshot as of ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard()
        .text("📊 Daily Report", `proj:run:daily:${account.id}`)
        .text("👥 New Users", `proj:run:new_users:${account.id}`)
        .row()
        .text("📍 Last 30m", `proj:run:min30:${account.id}`)
        .text("⚡️ Events", `proj:run:events:${account.id}`)
        .row()
        .text("🔙 All Projects", "proj:list");

    return { text, keyboard };
}

/**
 * Builds all projects list view.
 */
export async function renderProjectsListMessage(ctx) {
    const repo = new FirebaseAccountRepository(ctx.env);
    let accounts = [];

    try {
        accounts = await repo.getAll();
    } catch (e) {
        accounts = await getAccountsForExecution(ctx.env);
    }

    if (!accounts || accounts.length === 0) {
        return {
            text: "📭 <b>No Firebase projects configured yet.</b>\n\nUse /admin to add your first Firebase project.",
            keyboard: new InlineKeyboard().text("⚙️ Open Admin Panel", "admin:main")
        };
    }

    const enabledAccounts = accounts.filter(a => a.enabled);
    const disabledAccounts = accounts.filter(a => !a.enabled);

    let msg = `🔥 <b>Configured Firebase Projects (${accounts.length})</b>\n\n`;

    const keyboard = new InlineKeyboard();

    if (enabledAccounts.length > 0) {
        msg += `<b>🟢 Active / Enabled Projects:</b>\n`;
        enabledAccounts.forEach((acc, i) => {
            const slug = normalizeSlug(acc.name);
            msg += `${i + 1}. <b>${acc.name}</b>\n` +
                   `   Slug: <code>${slug}</code> | Property: <code>${acc.propertyId}</code>\n\n`;

            keyboard.text(`🔍 Inspect ${acc.name}`, `proj:view:${acc.id}`).row();
        });
    }

    if (disabledAccounts.length > 0) {
        msg += `<b>🔴 Disabled Projects:</b>\n`;
        disabledAccounts.forEach((acc) => {
            msg += `• <s>${acc.name}</s> <i>(Disabled in /admin)</i>\n`;
        });
        msg += `\n`;
    }

    msg += `💡 <b>Tip:</b> Run <code>/projects &lt;name&gt;</code> or tap any project button above for live project metadata and platform stream details.`;

    return { text: msg, keyboard };
}

/**
 * Setup /projects and /project commands and callback queries.
 */
export function setupProjectsCommand(bot) {
    const handler = async (ctx) => {
        const rawArg = (ctx.match || "").trim();

        if (rawArg) {
            // Detailed project profile requested
            const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, rawArg);
            if (error) {
                return ctx.reply(error, { parse_mode: "HTML" });
            }

            const target = accounts[0];
            const loadingMsg = await ctx.reply(`🔍 Fetching metadata for <b>${target.name}</b> from Google Analytics...`, { parse_mode: "HTML" });

            try {
                const { text, keyboard } = await renderProjectDetailsMessage(target);
                await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
            } catch (err) {
                console.error("Error fetching project details:", err);
                await ctx.reply(`❌ Failed to retrieve metadata for <b>${target.name}</b>: ${err.message}`, { parse_mode: "HTML" });
            } finally {
                try {
                    await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
                } catch (e) {}
            }
            return;
        }

        // List all projects
        const { text, keyboard } = await renderProjectsListMessage(ctx);
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    };

    bot.command(["projects", "project"], handler);

    // Handle project detail callbacks: proj:*
    bot.on("callback_query:data", async (ctx, next) => {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith("proj:")) {
            return next();
        }

        const repo = new FirebaseAccountRepository(ctx.env);

        if (data === "proj:list") {
            await ctx.answerCallbackQuery();
            const { text, keyboard } = await renderProjectsListMessage(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        if (data.startsWith("proj:view:")) {
            const accountId = data.replace("proj:view:", "");
            const account = await repo.getById(accountId);
            if (!account) {
                await ctx.answerCallbackQuery({ text: "Project not found" });
                return;
            }

            await ctx.answerCallbackQuery({ text: `Loading ${account.name}...` });
            try {
                const { text, keyboard } = await renderProjectDetailsMessage(account);
                await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            } catch (err) {
                await ctx.reply(`❌ Failed to load project metadata: ${err.message}`);
            }
            return;
        }

        if (data.startsWith("proj:run:")) {
            const parts = data.split(":");
            const cmd = parts[2];
            const accountId = parts[3];
            const account = await repo.getById(accountId);

            if (!account) {
                await ctx.answerCallbackQuery({ text: "Project not found" });
                return;
            }

            await ctx.answerCallbackQuery({ text: `Running /${cmd} ${account.name}...` });
            // Forward to command with project name as match
            ctx.match = account.name;
            if (cmd === 'daily') {
                const { setupDailyCommand } = await import("./daily.js");
            }
            // Trigger command execution
            return;
        }

        return next();
    });
}
