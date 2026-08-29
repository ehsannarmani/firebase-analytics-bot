export function getMainAdminIds(ctx) {
    const envVar = ctx?.env?.MAIN_ADMIN_CHAT_ID || (typeof process !== 'undefined' ? process.env?.MAIN_ADMIN_CHAT_ID : undefined);
    if (!envVar) return [];
    return envVar.toString().split(",").map(id => id.trim()).filter(Boolean);
}

export function isMainAdmin(ctx) {
    const adminIds = getMainAdminIds(ctx);
    if (adminIds.length === 0) return false;

    const fromId = ctx?.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx?.chat?.id ? ctx.chat.id.toString() : null;

    return (fromId && adminIds.includes(fromId)) || (chatId && adminIds.includes(chatId));
}

export async function adminGuard(ctx, next) {
    if (!isMainAdmin(ctx)) {
        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery({
                text: "⛔️ Unauthorized: Admin privileges required.",
                show_alert: true,
            });
            return;
        }
        return ctx.reply("⛔️ Unauthorized: This action is restricted to the bot administrator.");
    }
    return next ? next() : true;
}
