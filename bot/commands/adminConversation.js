import { InlineKeyboard } from "grammy";
import { StateRepository } from "../db/stateRepository.js";
import { FirebaseAccountRepository } from "../db/accountRepository.js";
import { isMainAdmin } from "../middleware/adminAuth.js";
import { validateAccountCredentials } from "../services/analytics.js";
import { renderAccountDetails, renderAccountsList } from "./adminPanel.js";

/**
 * Extracts text content from a text message or an uploaded JSON document.
 */
async function extractMessageContent(ctx) {
    if (ctx.message?.text) {
        return ctx.message.text.trim().replace(/^\uFEFF/, '');
    }

    if (ctx.message?.document) {
        try {
            const file = await ctx.getFile();
            const botToken = ctx.env?.BOT_TOKEN || (typeof process !== 'undefined' ? process.env?.BOT_TOKEN : undefined);
            if (!botToken) {
                console.error("BOT_TOKEN is missing when attempting to download document.");
                return null;
            }
            const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
            const res = await fetch(fileUrl);
            if (res.ok) {
                const text = await res.text();
                return text.trim().replace(/^\uFEFF/, '');
            }
        } catch (e) {
            console.error("Error reading uploaded document:", e);
        }
    }

    if (ctx.message?.caption) {
        return ctx.message.caption.trim().replace(/^\uFEFF/, '');
    }

    return null;
}

/**
 * Helper to safely delete the user's message containing credentials
 */
async function safelyDeleteMessage(ctx) {
    try {
        if (ctx.message?.message_id) {
            await ctx.deleteMessage();
        }
    } catch (e) {
        // Deletion may fail if bot lacks delete messages permission in groups, ignore silently
    }
}

export function setupAdminConversation(bot) {
    // 1. /cancel command to abort any ongoing state
    bot.command("cancel", async (ctx) => {
        if (!isMainAdmin(ctx)) return;

        const stateRepo = new StateRepository(ctx.env);
        const state = await stateRepo.getState(ctx.chat.id);

        if (state) {
            await stateRepo.clearState(ctx.chat.id);
            const { text, keyboard } = await renderAccountsList(ctx);
            await ctx.reply("❌ <i>Operation cancelled.</i>\n\n" + text, {
                parse_mode: "HTML",
                reply_markup: keyboard,
            });
        } else {
            await ctx.reply("No active admin operation to cancel.");
        }
    });

    // 2. Message listener for ongoing admin conversation states
    bot.on("message", async (ctx, next) => {
        if (!isMainAdmin(ctx)) {
            return next();
        }

        // Ignore commands (starts with /)
        if (ctx.message?.text?.startsWith("/")) {
            return next();
        }

        const stateRepo = new StateRepository(ctx.env);
        const accountRepo = new FirebaseAccountRepository(ctx.env);
        const stateObj = await stateRepo.getState(ctx.chat.id);

        if (!stateObj || !stateObj.state) {
            return next();
        }

        const state = stateObj.state;
        const data = stateObj.data || {};
        const inputContent = await extractMessageContent(ctx);

        if (!inputContent) {
            await ctx.reply("⚠️ Please provide valid text or a JSON file.");
            return;
        }

        // -------------------------------------------------------------
        // FLOW: Add Firebase Account
        // -------------------------------------------------------------

        // Step 1: Receiving Account Name
        if (state === "ADD_ACCOUNT_NAME") {
            const name = inputContent;
            if (name.length < 2 || name.length > 50) {
                await ctx.reply("⚠️ Account name must be between 2 and 50 characters. Please enter a valid name:");
                return;
            }

            await stateRepo.setState(ctx.chat.id, "ADD_ACCOUNT_PROPERTY_ID", { name });

            const cancelKb = new InlineKeyboard().text("❌ Cancel", "admin:cancel");
            await ctx.reply(
                `➕ <b>Add Firebase Account (Step 2/3)</b>\n\n` +
                `Name: <b>${name}</b>\n\n` +
                `Now please send your <b>Google Analytics 4 Property ID</b>.\n\n` +
                `<i>Example:</i> <code>123456789</code> (numeric ID found in GA4 Admin ➔ Property Settings)`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // Step 2: Receiving Property ID
        if (state === "ADD_ACCOUNT_PROPERTY_ID") {
            const propertyId = inputContent.trim();
            if (!/^\d+$/.test(propertyId)) {
                await ctx.reply("⚠️ Property ID must contain only digits (e.g. <code>123456789</code>). Please enter a valid Property ID:", { parse_mode: "HTML" });
                return;
            }

            await stateRepo.setState(ctx.chat.id, "ADD_ACCOUNT_SERVICE_ACCOUNT", {
                name: data.name,
                propertyId
            });

            const cancelKb = new InlineKeyboard().text("❌ Cancel", "admin:cancel");
            await ctx.reply(
                `➕ <b>Add Firebase Account (Step 3/3)</b>\n\n` +
                `Name: <b>${data.name}</b>\n` +
                `Property ID: <code>${propertyId}</code>\n\n` +
                `Now paste the complete <b>Google Service Account JSON</b> (or upload the <code>.json</code> file).\n\n` +
                `<i>🔒 Security Assurance:\n` +
                `• The message containing your credentials will be automatically deleted immediately.\n` +
                `• Credentials will be verified live with Google Analytics before saving.\n` +
                `• No credentials will ever be printed or logged.</i>`,
                { parse_mode: "HTML", reply_markup: cancelKb }
            );
            return;
        }

        // Step 3: Receiving Service Account JSON & Validation
        if (state === "ADD_ACCOUNT_SERVICE_ACCOUNT") {
            const serviceAccountJson = inputContent;

            // Immediately delete the sensitive message containing JSON credentials
            await safelyDeleteMessage(ctx);

            const statusMsg = await ctx.reply("🔍 Validating Service Account credentials and testing Google Analytics API access...");

            const validation = await validateAccountCredentials(serviceAccountJson, data.propertyId);

            if (!validation.ok) {
                const retryKb = new InlineKeyboard().text("❌ Cancel", "admin:cancel");
                await ctx.api.editMessageText(
                    ctx.chat.id,
                    statusMsg.message_id,
                    `❌ <b>Validation Failed!</b>\n\n` +
                    `<b>Reason:</b>\n${validation.error}\n\n` +
                    `Please check your JSON credentials and paste/upload the valid Service Account JSON again, or click Cancel:`,
                    { parse_mode: "HTML", reply_markup: retryKb }
                );
                return;
            }

            // Create account in repository
            const newAccount = await accountRepo.create({
                name: data.name,
                propertyId: data.propertyId,
                serviceAccountJson: serviceAccountJson,
                enabled: true,
            });

            // Clear conversation state
            await stateRepo.clearState(ctx.chat.id);

            const successKb = new InlineKeyboard()
                .text("📊 View Account", `admin:acc:${newAccount.id}`)
                .text("🔥 All Accounts", "admin:accounts")
                .row()
                .text("🧪 Test Connection", `admin:test:${newAccount.id}`);

            await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Firebase Account Added Successfully!</b>\n\n` +
                `🏷 <b>Name:</b> ${newAccount.name}\n` +
                `🆔 <b>Property ID:</b> <code>${newAccount.propertyId}</code>\n` +
                `📧 <b>Service Account Email:</b> <code>${validation.clientEmail}</code>\n` +
                `🚦 <b>Status:</b> 🟢 <b>Enabled</b>\n\n` +
                `🎉 This project is now active and will be included in all scheduled reports and analytics commands!`,
                { parse_mode: "HTML", reply_markup: successKb }
            );
            return;
        }

        // -------------------------------------------------------------
        // FLOW: Edit Account Fields
        // -------------------------------------------------------------

        if (state === "EDIT_ACCOUNT_NAME") {
            const newName = inputContent;
            if (newName.length < 2 || newName.length > 50) {
                await ctx.reply("⚠️ Account name must be between 2 and 50 characters.");
                return;
            }

            await accountRepo.update(data.accountId, { name: newName });
            await stateRepo.clearState(ctx.chat.id);

            const { text, keyboard } = await renderAccountDetails(ctx, data.accountId);
            await ctx.reply(`✅ <b>Name updated to:</b> ${newName}\n\n` + text, {
                parse_mode: "HTML",
                reply_markup: keyboard,
            });
            return;
        }

        if (state === "EDIT_ACCOUNT_PROP") {
            const newPropertyId = inputContent.trim();
            if (!/^\d+$/.test(newPropertyId)) {
                await ctx.reply("⚠️ Property ID must contain only digits (e.g. <code>123456789</code>).", { parse_mode: "HTML" });
                return;
            }

            await accountRepo.update(data.accountId, { propertyId: newPropertyId });
            await stateRepo.clearState(ctx.chat.id);

            const { text, keyboard } = await renderAccountDetails(ctx, data.accountId);
            await ctx.reply(`✅ <b>Property ID updated to:</b> <code>${newPropertyId}</code>\n\n` + text, {
                parse_mode: "HTML",
                reply_markup: keyboard,
            });
            return;
        }

        if (state === "EDIT_ACCOUNT_SA") {
            const newSaJson = inputContent;
            await safelyDeleteMessage(ctx);

            const account = await accountRepo.getById(data.accountId);
            if (!account) {
                await stateRepo.clearState(ctx.chat.id);
                await ctx.reply("❌ Account not found.");
                return;
            }

            const statusMsg = await ctx.reply("🔍 Validating new Service Account credentials...");
            const validation = await validateAccountCredentials(newSaJson, account.propertyId);

            if (!validation.ok) {
                const retryKb = new InlineKeyboard().text("❌ Cancel", `admin:acc:${data.accountId}`);
                await ctx.api.editMessageText(
                    ctx.chat.id,
                    statusMsg.message_id,
                    `❌ <b>Validation Failed!</b>\n\n` +
                    `<b>Reason:</b>\n${validation.error}\n\n` +
                    `Please check your JSON and try again:`,
                    { parse_mode: "HTML", reply_markup: retryKb }
                );
                return;
            }

            await accountRepo.update(data.accountId, { serviceAccountJson: newSaJson });
            await stateRepo.clearState(ctx.chat.id);

            const { text, keyboard } = await renderAccountDetails(ctx, data.accountId);
            await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Credentials Updated Successfully!</b>\n\n` + text,
                { parse_mode: "HTML", reply_markup: keyboard }
            );
            return;
        }

        // -------------------------------------------------------------
        // FLOW: Add Authorized Chat
        // -------------------------------------------------------------
        if (state === "ADD_AUTH_CHAT_ID") {
            const trimmed = inputContent.trim();
            const parts = trimmed.split(/\s+/);
            const chatId = parts[0];
            const label = parts.slice(1).join(" ") || null;

            if (!/^-?\d+$/.test(chatId)) {
                await ctx.reply(
                    "⚠️ Invalid Chat ID format. Chat ID must be a numeric value (e.g. <code>123456789</code> or <code>-1001234567890</code>).\n\n" +
                    "Please try again or click /cancel:",
                    { parse_mode: "HTML" }
                );
                return;
            }

            const { AuthorizedChatRepository } = await import("../db/authorizedChatRepository.js");
            const authRepo = new AuthorizedChatRepository(ctx.env);
            await authRepo.add(chatId, label);
            await stateRepo.clearState(ctx.chat.id);

            await ctx.reply(
                `✅ <b>Authorized Chat Added!</b>\n\n` +
                `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n` +
                (label ? `🏷 <b>Label:</b> ${label}\n\n` : `\n`) +
                text,
                { parse_mode: "HTML", reply_markup: keyboard }
            );
            return;
        }

        // -------------------------------------------------------------
        // FLOW: Set Report Channel ID
        // -------------------------------------------------------------
        if (state === "SET_UPDATE_CHANNEL_ID") {
            const channelId = inputContent.trim();

            if (!/^-?\d+$/.test(channelId)) {
                await ctx.reply(
                    "⚠️ Invalid Channel ID format. Telegram Channel IDs are numeric and typically start with a minus (e.g. <code>-1001234567890</code>).\n\n" +
                    "Please try again or click /cancel:",
                    { parse_mode: "HTML" }
                );
                return;
            }

            const { SettingsRepository } = await import("../db/settingsRepository.js");
            const settingsRepo = new SettingsRepository(ctx.env);
            await settingsRepo.setUpdateChannelId(channelId);
            await stateRepo.clearState(ctx.chat.id);

            const { renderChannelSettings } = await import("./adminPanel.js");
            const { text, keyboard } = await renderChannelSettings(ctx);

            await ctx.reply(
                `✅ <b>Report Channel Configured Successfully!</b>\n\n` +
                `🆔 <b>Channel ID:</b> <code>${channelId}</code>\n\n` +
                text,
                { parse_mode: "HTML", reply_markup: keyboard }
            );
            return;
        }

        return next();
    });
}
