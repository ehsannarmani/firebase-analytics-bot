import { InlineKeyboard } from "grammy";
import { FirebaseAccountRepository } from "../db/accountRepository.js";
import { StateRepository } from "../db/stateRepository.js";
import { AuthorizedChatRepository } from "../db/authorizedChatRepository.js";
import { SettingsRepository } from "../db/settingsRepository.js";
import { adminGuard, isMainAdmin } from "../middleware/adminAuth.js";
import {
    validateAccountCredentials,
    getActiveUsersLast30Minutes,
    getLifetimeActiveUsers,
    getDailyActiveUsers
} from "../services/analytics.js";
import { getFormattedDate } from "../services/dateUtils.js";

/**
 * Builds the Main Admin Panel view.
 */
export async function renderMainAdminPanel(ctx) {
    const repo = new FirebaseAccountRepository(ctx.env);
    const { total, enabled } = await repo.count();

    const authRepo = new AuthorizedChatRepository(ctx.env);
    const authChatsCount = await authRepo.count();

    const settingsRepo = new SettingsRepository(ctx.env);
    const { channelId, source } = await settingsRepo.getUpdateChannelId(ctx.env);
    const channelSummary = channelId ? `<code>${channelId}</code> (${source})` : `<i>Not configured</i>`;

    const text = `⚙️ <b>Admin Control Panel</b>\n\n` +
        `📊 <b>Connected Firebase Projects:</b> <code>${total}</code> (${enabled} enabled)\n` +
        `👥 <b>Authorized Chats:</b> <code>${authChatsCount}</code> configured in database\n` +
        `📢 <b>Report Channel:</b> ${channelSummary}\n` +
        `🛡 <b>Role:</b> Bot Administrator\n` +
        `🕒 <b>Time:</b> ${getFormattedDate()}\n\n` +
        `<i>Select an option below to manage accounts, reports, and settings:</i>`;

    const keyboard = new InlineKeyboard()
        .text("🔥 Firebase Accounts", "admin:accounts")
        .text("👥 Authorized Chats", "admin:auth_chats")
        .row()
        .text("📢 Report Channel", "admin:channel")
        .text("🔄 Migration", "admin:migrate")
        .row()
        .text("📊 Test 15m Report", "admin:test_report:min30")
        .text("📊 Test 4h Daily Report", "admin:test_report:daily")
        .row()
        .text("❌ Close", "admin:close");

    return { text, keyboard };
}

/**
 * Builds the Accounts List view.
 */
export async function renderAccountsList(ctx) {
    const repo = new FirebaseAccountRepository(ctx.env);
    const accounts = await repo.getAll();

    let text = `🔥 <b>Firebase Accounts Management</b>\n\n`;

    const keyboard = new InlineKeyboard();

    if (accounts.length === 0) {
        text += `📭 <i>No Firebase accounts configured yet.</i>\n\n` +
            `Click <b>➕ Add Firebase Account</b> below to connect your first project!`;
    } else {
        text += `Found <b>${accounts.length}</b> configured account(s):\n\n`;
        accounts.forEach((acc, index) => {
            const statusEmoji = acc.enabled ? "🟢" : "🔴";
            const statusText = acc.enabled ? "Enabled" : "Disabled";
            text += `${index + 1}. <b>${acc.name}</b>\n` +
                `   Property ID: <code>${acc.propertyId}</code>\n` +
                `   Status: ${statusEmoji} <i>${statusText}</i>\n\n`;

            keyboard.text(`${statusEmoji} ${acc.name}`, `admin:acc:${acc.id}`).row();
        });
    }

    keyboard
        .text("➕ Add Firebase Account", "admin:add")
        .row()
        .text("🔙 Back to Admin", "admin:main");

    return { text, keyboard };
}

/**
 * Builds the Single Account Details view.
 */
export async function renderAccountDetails(ctx, accountId) {
    const repo = new FirebaseAccountRepository(ctx.env);
    const account = await repo.getById(accountId);

    if (!account) {
        return {
            text: "❌ <b>Account not found.</b> It may have been deleted.",
            keyboard: new InlineKeyboard().text("🔙 Back to Accounts", "admin:accounts")
        };
    }

    const statusEmoji = account.enabled ? "🟢" : "🔴";
    const statusText = account.enabled ? "Enabled" : "Disabled";
    const toggleButtonText = account.enabled ? "🔴 Disable Account" : "🟢 Enable Account";

    const text = `🔥 <b>Account Details: ${account.name}</b>\n\n` +
        `🏷 <b>Name:</b> ${account.name}\n` +
        `🆔 <b>Property ID:</b> <code>${account.propertyId}</code>\n` +
        `🚦 <b>Status:</b> ${statusEmoji} <b>${statusText}</b>\n` +
        `📅 <b>Created:</b> <code>${account.createdAt || 'N/A'}</code>\n` +
        `🔄 <b>Last Updated:</b> <code>${account.updatedAt || 'N/A'}</code>\n\n` +
        `<i>Use the buttons below to manage this project:</i>`;

    const keyboard = new InlineKeyboard()
        .text("🧪 Test Connection", `admin:test:${account.id}`)
        .text(toggleButtonText, `admin:toggle:${account.id}`)
        .row()
        .text("✏️ Edit Name", `admin:edit_name:${account.id}`)
        .text("✏️ Edit Property ID", `admin:edit_prop:${account.id}`)
        .row()
        .text("✏️ Update Credentials", `admin:edit_sa:${account.id}`)
        .text("🗑 Delete Account", `admin:del_ask:${account.id}`)
        .row()
        .text("🔙 Back to Accounts", "admin:accounts");

    return { text, keyboard };
}

/**
 * Builds the Authorized Chats view.
 */
export async function renderAuthorizedChatsList(ctx) {
    const authRepo = new AuthorizedChatRepository(ctx.env);
    const dbChats = await authRepo.getAll();

    const envVar = ctx?.env?.AUTHORIZED_CHATS || (typeof process !== 'undefined' ? process.env?.AUTHORIZED_CHATS : undefined);
    const envIds = envVar ? envVar.toString().split(",").map(id => id.trim()).filter(Boolean) : [];

    let text = `👥 <b>Authorized Chats Management</b>\n\n`;

    if (dbChats.length === 0 && envIds.length === 0) {
        text += `🔒 <b>Access Mode: Main Admin Only</b>\n\n` +
            `No additional chats are authorized. The bot is private and will only respond to the <b>Main Admin</b>.\n\n` +
            `<i>To grant access to team members or groups, tap <b>➕ Add Authorized Chat</b> below.</i>`;
    } else {
        text += `🔒 <b>Access Mode: Main Admin & Authorized Chats</b>\n\n`;

        if (dbChats.length > 0) {
            text += `<b>Database Authorized Chats (${dbChats.length}):</b>\n`;
            dbChats.forEach((c, idx) => {
                const label = c.label ? ` (${c.label})` : '';
                text += `${idx + 1}. <code>${c.chatId}</code>${label}\n`;
            });
            text += `\n`;
        }

        if (envIds.length > 0) {
            text += `<b>Environment Variable Chats (${envIds.length}):</b>\n`;
            envIds.forEach((id, idx) => {
                text += `• <code>${id}</code> <i>(from AUTHORIZED_CHATS secret)</i>\n`;
            });
            text += `\n`;
        }
    }

    const keyboard = new InlineKeyboard();

    if (dbChats.length > 0) {
        dbChats.forEach(c => {
            const label = c.label ? `${c.label} (${c.chatId})` : `Chat ${c.chatId}`;
            keyboard.text(`🗑 Remove ${label}`, `admin:del_auth:${c.chatId}`).row();
        });
    }

    keyboard
        .text("➕ Add Authorized Chat", "admin:add_auth")
        .row()
        .text("🔙 Back to Admin", "admin:main");

    return { text, keyboard };
}

/**
 * Builds the Report Channel Settings view.
 */
export async function renderChannelSettings(ctx) {
    const settingsRepo = new SettingsRepository(ctx.env);
    const { channelId, source } = await settingsRepo.getUpdateChannelId(ctx.env);

    let text = `📢 <b>Automated Report Channel Configuration</b>\n\n`;

    if (channelId) {
        const sourceLabel = source === 'database' ? '🟢 Configured in Database' : '🔵 Configured via Environment (UPDATE_CHANNEL_ID)';
        text += `🆔 <b>Active Channel ID:</b> <code>${channelId}</code>\n` +
            `🏷 <b>Source:</b> ${sourceLabel}\n\n` +
            `⏰ <b>Automated Reports Scheduled for this Channel:</b>\n` +
            `• <b>15-Minute Report</b> (Active users in last 30 minutes)\n` +
            `• <b>4-Hour Daily Report</b> (Daily active users & lifetime users with auto-pin)\n\n` +
            `<i>Make sure the bot has been added as an <b>Administrator</b> in this channel with permission to Post Messages and Pin Messages.</i>`;
    } else {
        text += `⚠️ <b>No automated report channel configured.</b>\n\n` +
            `Automated 15-minute and 4-hour scheduled reports are currently dormant.\n\n` +
            `<i>Click <b>✏️ Set Channel ID</b> below to configure your Telegram channel!</i>`;
    }

    const keyboard = new InlineKeyboard()
        .text("✏️ Set / Change Channel ID", "admin:set_channel");

    if (channelId) {
        keyboard.text("🧪 Test Channel Message", "admin:test_channel").row();
        if (source === 'database') {
            keyboard.text("🗑 Clear Channel from DB", "admin:clear_channel").row();
        }
    } else {
        keyboard.row();
    }

    keyboard.text("🔙 Back to Admin", "admin:main");

    return { text, keyboard };
}

export function setupAdminPanelCommand(bot) {
    // /admin command
    bot.command("admin", async (ctx) => {
        if (!isMainAdmin(ctx)) {
            return ctx.reply("⛔️ Unauthorized: This command is restricted to the bot administrator.");
        }

        const { text, keyboard } = await renderMainAdminPanel(ctx);
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
    });

    // Handle all admin:* callback queries
    bot.on("callback_query:data", async (ctx, next) => {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith("admin:")) {
            return next();
        }

        if (!isMainAdmin(ctx)) {
            await ctx.answerCallbackQuery({
                text: "⛔️ Unauthorized: Admin privileges required.",
                show_alert: true,
            });
            return;
        }

        const stateRepo = new StateRepository(ctx.env);

        // 1. Close panel
        if (data === "admin:close") {
            await stateRepo.clearState(ctx.chat.id);
            await ctx.answerCallbackQuery();
            try {
                await ctx.deleteMessage();
            } catch (e) {
                await ctx.editMessageText("🔒 <i>Admin panel closed.</i>", { parse_mode: "HTML" });
            }
            return;
        }

        // 2. Main menu
        if (data === "admin:main") {
            await stateRepo.clearState(ctx.chat.id);
            await ctx.answerCallbackQuery();
            const { text, keyboard } = await renderMainAdminPanel(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 3. Accounts list
        if (data === "admin:accounts") {
            await stateRepo.clearState(ctx.chat.id);
            await ctx.answerCallbackQuery();
            const { text, keyboard } = await renderAccountsList(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 4. View account details: admin:acc:<id>
        if (data.startsWith("admin:acc:")) {
            await stateRepo.clearState(ctx.chat.id);
            const accountId = data.replace("admin:acc:", "");
            await ctx.answerCallbackQuery();
            const { text, keyboard } = await renderAccountDetails(ctx, accountId);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 5. Add Account start: admin:add
        if (data === "admin:add") {
            await stateRepo.setState(ctx.chat.id, "ADD_ACCOUNT_NAME", {});
            await ctx.answerCallbackQuery();

            const cancelKb = new InlineKeyboard().text("❌ Cancel", "admin:cancel");
            await ctx.editMessageText(
                `➕ <b>Add Firebase Account (Step 1/3)</b>\n\n` +
                `Please send the <b>Name</b> for this Firebase project.\n\n` +
                `<i>Example:</i> <code>My Production App</code>`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // 6. Test connection: admin:test:<id>
        if (data.startsWith("admin:test:")) {
            const accountId = data.replace("admin:test:", "");
            await ctx.answerCallbackQuery({ text: "Testing connection to GA4..." });

            const repo = new FirebaseAccountRepository(ctx.env);
            const account = await repo.getById(accountId);
            if (!account) {
                await ctx.reply("❌ Account not found.");
                return;
            }

            const loadingMsg = await ctx.reply(`🧪 Testing connection for <b>${account.name}</b> (Property: <code>${account.propertyId}</code>)...`, { parse_mode: "HTML" });
            try {
                const validation = await validateAccountCredentials(account.serviceAccountJson, account.propertyId);
                if (validation.ok) {
                    await ctx.api.editMessageText(
                        ctx.chat.id,
                        loadingMsg.message_id,
                        `✅ <b>Connection Successful!</b>\n\n` +
                        `🔥 <b>Firebase Account:</b> ${account.name}\n` +
                        `🆔 <b>Property ID:</b> <code>${account.propertyId}</code>\n` +
                        `📧 <b>Service Account Email:</b> <code>${validation.clientEmail}</code>\n\n` +
                        `✨ The bot can successfully query Google Analytics for this project.`,
                        { parse_mode: "HTML" }
                    );
                } else {
                    await ctx.api.editMessageText(
                        ctx.chat.id,
                        loadingMsg.message_id,
                        `❌ <b>Connection Failed!</b>\n\n` +
                        `🔥 <b>Firebase Account:</b> ${account.name}\n` +
                        `🆔 <b>Property ID:</b> <code>${account.propertyId}</code>\n\n` +
                        `<b>Reason:</b>\n${validation.error}\n\n` +
                        `<i>💡 Ensure the service account email is added as a 'Viewer' in GA4 Admin ➔ Property Access Management.</i>`,
                        { parse_mode: "HTML" }
                    );
                }
            } catch (err) {
                await ctx.api.editMessageText(
                    ctx.chat.id,
                    loadingMsg.message_id,
                    `❌ <b>Connection error:</b> ${err.message}`,
                    { parse_mode: "HTML" }
                );
            }
            return;
        }

        // 7. Toggle enable/disable: admin:toggle:<id>
        if (data.startsWith("admin:toggle:")) {
            const accountId = data.replace("admin:toggle:", "");
            const repo = new FirebaseAccountRepository(ctx.env);
            const account = await repo.getById(accountId);
            if (account) {
                const newEnabled = !account.enabled;
                await repo.setEnabled(accountId, newEnabled);
                await ctx.answerCallbackQuery({
                    text: newEnabled ? "🟢 Account enabled!" : "🔴 Account disabled.",
                });
            }
            const { text, keyboard } = await renderAccountDetails(ctx, accountId);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 8. Delete ask confirmation: admin:del_ask:<id>
        if (data.startsWith("admin:del_ask:")) {
            const accountId = data.replace("admin:del_ask:", "");
            const repo = new FirebaseAccountRepository(ctx.env);
            const account = await repo.getById(accountId);

            if (!account) {
                await ctx.answerCallbackQuery({ text: "Account not found" });
                return;
            }

            await ctx.answerCallbackQuery();
            const confirmKb = new InlineKeyboard()
                .text("🗑 Yes, Delete Account", `admin:del_confirm:${account.id}`)
                .row()
                .text("❌ Cancel", `admin:acc:${account.id}`);

            await ctx.editMessageText(
                `⚠️ <b>Delete Account Confirmation</b>\n\n` +
                `Are you sure you want to permanently delete:\n` +
                `🔥 <b>${account.name}</b> (Property: <code>${account.propertyId}</code>)?\n\n` +
                `<i>This will immediately remove it from all automated reports and commands.</i>`,
                { parse_mode: "HTML", reply_markup: confirmKb }
            );
            return;
        }

        // 9. Delete confirmed: admin:del_confirm:<id>
        if (data.startsWith("admin:del_confirm:")) {
            const accountId = data.replace("admin:del_confirm:", "");
            const repo = new FirebaseAccountRepository(ctx.env);
            const account = await repo.getById(accountId);
            const name = account ? account.name : "Account";

            await repo.delete(accountId);
            await ctx.answerCallbackQuery({ text: `Deleted ${name}` });

            const { text, keyboard } = await renderAccountsList(ctx);
            await ctx.editMessageText(
                `🗑 <b>${name}</b> has been deleted.\n\n${text}`,
                { parse_mode: "HTML", reply_markup: keyboard }
            );
            return;
        }

        // 10. Edit Name: admin:edit_name:<id>
        if (data.startsWith("admin:edit_name:")) {
            const accountId = data.replace("admin:edit_name:", "");
            await stateRepo.setState(ctx.chat.id, "EDIT_ACCOUNT_NAME", { accountId });
            await ctx.answerCallbackQuery();
            const cancelKb = new InlineKeyboard().text("❌ Cancel", `admin:acc:${accountId}`);
            await ctx.editMessageText(
                `✏️ <b>Edit Account Name</b>\n\n` +
                `Please send the new name for this Firebase account:`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // 11. Edit Property ID: admin:edit_prop:<id>
        if (data.startsWith("admin:edit_prop:")) {
            const accountId = data.replace("admin:edit_prop:", "");
            await stateRepo.setState(ctx.chat.id, "EDIT_ACCOUNT_PROP", { accountId });
            await ctx.answerCallbackQuery();
            const cancelKb = new InlineKeyboard().text("❌ Cancel", `admin:acc:${accountId}`);
            await ctx.editMessageText(
                `✏️ <b>Edit Property ID</b>\n\n` +
                `Please send the new numeric Google Analytics Property ID:`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // 12. Edit Service Account: admin:edit_sa:<id>
        if (data.startsWith("admin:edit_sa:")) {
            const accountId = data.replace("admin:edit_sa:", "");
            await stateRepo.setState(ctx.chat.id, "EDIT_ACCOUNT_SA", { accountId });
            await ctx.answerCallbackQuery();
            const cancelKb = new InlineKeyboard().text("❌ Cancel", `admin:acc:${accountId}`);
            await ctx.editMessageText(
                `✏️ <b>Update Service Account Credentials</b>\n\n` +
                `Please paste the new Service Account JSON content (or upload the JSON file).\n\n` +
                `<i>🔒 Security note: The message will be deleted immediately upon processing.</i>`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // 13. Cancel action: admin:cancel
        if (data === "admin:cancel") {
            await stateRepo.clearState(ctx.chat.id);
            await ctx.answerCallbackQuery({ text: "Operation cancelled." });
            const { text, keyboard } = await renderMainAdminPanel(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 14. Authorized Chats list: admin:auth_chats
        if (data === "admin:auth_chats") {
            await stateRepo.clearState(ctx.chat.id);
            await ctx.answerCallbackQuery();
            const { text, keyboard } = await renderAuthorizedChatsList(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 15. Add Authorized Chat: admin:add_auth
        if (data === "admin:add_auth") {
            await stateRepo.setState(ctx.chat.id, "ADD_AUTH_CHAT_ID", {});
            await ctx.answerCallbackQuery();

            const cancelKb = new InlineKeyboard().text("❌ Cancel", "admin:auth_chats");
            await ctx.editMessageText(
                `➕ <b>Add Authorized Chat</b>\n\n` +
                `Please send the Telegram <b>Chat ID</b> or <b>User ID</b> to authorize.\n\n` +
                `<i>Examples:</i>\n` +
                `• User ID: <code>123456789</code>\n` +
                `• Group/Channel ID: <code>-1001234567890</code>\n` +
                `• With optional label: <code>123456789 John Doe (Marketing)</code>`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // 16. Remove Authorized Chat: admin:del_auth:<id>
        if (data.startsWith("admin:del_auth:")) {
            const chatId = data.replace("admin:del_auth:", "");
            const authRepo = new AuthorizedChatRepository(ctx.env);
            await authRepo.remove(chatId);
            await ctx.answerCallbackQuery({ text: `Removed chat ${chatId}` });

            const { text, keyboard } = await renderAuthorizedChatsList(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 17. Report Channel Settings: admin:channel
        if (data === "admin:channel") {
            await stateRepo.clearState(ctx.chat.id);
            await ctx.answerCallbackQuery();
            const { text, keyboard } = await renderChannelSettings(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 18. Set Report Channel ID: admin:set_channel
        if (data === "admin:set_channel") {
            await stateRepo.setState(ctx.chat.id, "SET_UPDATE_CHANNEL_ID", {});
            await ctx.answerCallbackQuery();

            const cancelKb = new InlineKeyboard().text("❌ Cancel", "admin:channel");
            await ctx.editMessageText(
                `📢 <b>Set Report Channel ID</b>\n\n` +
                `Please send the Telegram <b>Channel ID</b> for automated reports.\n\n` +
                `<i>Example:</i> <code>-1001234567890</code>\n\n` +
                `<i>💡 Tip: You can forward any message from your channel to this chat to obtain the ID, or use @userinfobot.</i>`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // 19. Clear Report Channel ID from DB: admin:clear_channel
        if (data === "admin:clear_channel") {
            const settingsRepo = new SettingsRepository(ctx.env);
            await settingsRepo.clearUpdateChannelId();
            await ctx.answerCallbackQuery({ text: "Cleared channel from database." });

            const { text, keyboard } = await renderChannelSettings(ctx);
            await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard });
            return;
        }

        // 20. Test Channel Message: admin:test_channel
        if (data === "admin:test_channel") {
            const settingsRepo = new SettingsRepository(ctx.env);
            const { channelId } = await settingsRepo.getUpdateChannelId(ctx.env);

            if (!channelId) {
                await ctx.answerCallbackQuery({ text: "No channel configured." });
                return;
            }

            await ctx.answerCallbackQuery({ text: "Sending test message to channel..." });
            try {
                const testMsg = await ctx.api.sendMessage(
                    channelId,
                    `🤖 <b>Firebase Analytics Bot — Channel Test Message</b>\n\n` +
                    `✅ Channel permissions verified! Automated scheduled reports will be delivered to this channel.\n\n` +
                    `🕒 ${getFormattedDate()}`,
                    { parse_mode: "HTML" }
                );

                await ctx.reply(`✅ <b>Test message sent successfully!</b> (Message ID: <code>${testMsg.message_id}</code>)`, { parse_mode: "HTML" });
            } catch (err) {
                await ctx.reply(`❌ <b>Failed to post to channel <code>${channelId}</code>:</b>\n\n${err.message}\n\n<i>Ensure the bot is added as an Administrator in the channel.</i>`, { parse_mode: "HTML" });
            }
            return;
        }

        // 21. Test Reports from admin
        if (data === "admin:test_report:min30") {
            await ctx.answerCallbackQuery({ text: "Generating 15m test report..." });
            const repo = new FirebaseAccountRepository(ctx.env);
            const accounts = await repo.getEnabled();

            if (accounts.length === 0) {
                await ctx.reply("📭 No enabled Firebase accounts found to generate report.");
                return;
            }

            let msg = `📍 <b>Test Active Users (Last 30 Min) Report</b>\n`;
            let total = 0;
            for (const acc of accounts) {
                try {
                    const count = await getActiveUsersLast30Minutes(acc);
                    msg += `\n━━━━━━━━━━━━━━━━━━\n🔥 <b>${acc.name}</b>\nActive users: <code>${count}</code>\n`;
                    total += Number(count) || 0;
                } catch (err) {
                    msg += `\n━━━━━━━━━━━━━━━━━━\n🔥 <b>${acc.name}</b>\n❌ <i>${err.message}</i>\n`;
                }
            }
            if (accounts.length > 1) {
                msg += `\n━━━━━━━━━━━━━━━━━━\n📈 <b>Total Active Users:</b> <code>${total}</code>\n`;
            }
            msg += `\n⏳ ${getFormattedDate()}`;
            await ctx.reply(msg, { parse_mode: "HTML" });
            return;
        }

        if (data === "admin:test_report:daily") {
            await ctx.answerCallbackQuery({ text: "Generating 4h daily test report..." });
            const repo = new FirebaseAccountRepository(ctx.env);
            const accounts = await repo.getEnabled();

            if (accounts.length === 0) {
                await ctx.reply("📭 No enabled Firebase accounts found to generate report.");
                return;
            }

            let msg = `📊 <b>Test Daily Analytics Report</b>\n`;
            let totalToday = 0;
            let totalLifetime = 0;

            for (const acc of accounts) {
                try {
                    const lifetime = await getLifetimeActiveUsers(acc);
                    const daily = (await getDailyActiveUsers('activeUsers', acc)).reverse();
                    const today = daily && daily.length > 0 ? daily[0] : null;

                    msg += `\n━━━━━━━━━━━━━━━━━━\n🔥 <b>${acc.name}</b>\n`;
                    if (today) {
                        msg += `👥 Today active: <code>${today.users}</code>\n`;
                        if (today.grow) {
                            msg += today.grow < 0
                                ? `😓 Fell <code>${today.grow}%</code>\n`
                                : `🎉 Grew <code>${today.grow}%</code>\n`;
                        }
                        totalToday += Number(today.users) || 0;
                    }
                    msg += `🙌 Lifetime Users: <code>${lifetime}</code>\n`;
                    totalLifetime += Number(lifetime) || 0;
                } catch (err) {
                    msg += `\n━━━━━━━━━━━━━━━━━━\n🔥 <b>${acc.name}</b>\n❌ <i>${err.message}</i>\n`;
                }
            }

            if (accounts.length > 1) {
                msg += `\n━━━━━━━━━━━━━━━━━━\n📈 <b>Combined Total:</b>\n`;
                msg += `👥 Today Active: <code>${totalToday}</code>\n`;
                msg += `🙌 Lifetime Users: <code>${totalLifetime}</code>\n`;
            }

            msg += `\n⏳ ${getFormattedDate()}`;
            await ctx.reply(msg, { parse_mode: "HTML" });
            return;
        }

        // 22. Migration button: admin:migrate
        if (data === "admin:migrate") {
            await ctx.answerCallbackQuery();
            const { migrateLegacyCredentials } = await import("./migrate.js");
            const result = await migrateLegacyCredentials(ctx);
            await ctx.reply(result, { parse_mode: "HTML" });
            return;
        }
    });
}
