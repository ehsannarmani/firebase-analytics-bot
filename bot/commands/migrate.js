import { FirebaseAccountRepository } from "../db/accountRepository.js";
import { isMainAdmin } from "../middleware/adminAuth.js";
import { getCredentials, validateAccountCredentials } from "../services/analytics.js";

/**
 * Migrates legacy environment variables (PROPERTY_ID and SERVICE_ACCOUNT_JSON) into D1.
 */
export async function migrateLegacyCredentials(ctx) {
    const env = ctx.env || (typeof process !== 'undefined' ? process.env : {});
    const repo = new FirebaseAccountRepository(env);

    let legacyCreds;
    try {
        legacyCreds = await getCredentials(env);
    } catch (e) {
        return "ℹ️ <b>No legacy credentials found in environment variables</b> (PROPERTY_ID / SERVICE_ACCOUNT_JSON).\n\nUse <code>/admin</code> ➔ <b>➕ Add Firebase Account</b> to connect your projects.";
    }

    if (!legacyCreds || !legacyCreds.propertyId) {
        return "ℹ️ <b>No legacy PROPERTY_ID detected.</b> Nothing to migrate.";
    }

    // Check if account with same propertyId already exists in DB
    const existingAccounts = await repo.getAll();
    const duplicate = existingAccounts.find(a => a.propertyId === legacyCreds.propertyId);

    if (duplicate) {
        return `ℹ️ <b>Account already exists in database:</b>\n\n` +
            `🔥 <b>${duplicate.name}</b> (Property: <code>${duplicate.propertyId}</code>)\n\n` +
            `No duplicate was created. You can manage this project in <code>/admin</code>.`;
    }

    // Prepare JSON payload for migration
    let saJson = env.SERVICE_ACCOUNT_JSON;
    if (!saJson) {
        saJson = JSON.stringify({
            type: "service_account",
            client_email: legacyCreds.clientEmail,
            private_key: legacyCreds.privateKey,
            property_id: legacyCreds.propertyId,
        });
    } else if (typeof saJson === 'object') {
        saJson = JSON.stringify(saJson);
    }

    // Validate credentials before saving
    const validation = await validateAccountCredentials(saJson, legacyCreds.propertyId);
    if (!validation.ok) {
        return `❌ <b>Migration failed:</b> Legacy credentials in environment variables failed validation:\n\n${validation.error}`;
    }

    // Save into D1
    const newAccount = await repo.create({
        name: "Default App (Migrated)",
        propertyId: legacyCreds.propertyId,
        serviceAccountJson: saJson,
        enabled: true,
    });

    return `✅ <b>Legacy Configuration Migrated Successfully!</b>\n\n` +
        `🔥 <b>Name:</b> ${newAccount.name}\n` +
        `🆔 <b>Property ID:</b> <code>${newAccount.propertyId}</code>\n` +
        `📧 <b>Email:</b> <code>${validation.clientEmail}</code>\n` +
        `🚦 <b>Status:</b> 🟢 Enabled\n\n` +
        `✨ You can now remove <code>PROPERTY_ID</code> and <code>SERVICE_ACCOUNT_JSON</code> from Wrangler secrets and manage all accounts directly from <code>/admin</code>.`;
}

export function setupMigrateCommand(bot) {
    bot.command("migrate", async (ctx) => {
        if (!isMainAdmin(ctx)) {
            return ctx.reply("⛔️ Unauthorized: This command is restricted to the bot administrator.");
        }

        const result = await migrateLegacyCredentials(ctx);
        await ctx.reply(result, { parse_mode: "HTML" });
    });
}
