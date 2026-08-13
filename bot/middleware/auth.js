export function getAuthorizedChats(ctx) {
    const envVar = ctx?.env?.AUTHORIZED_CHATS || (typeof process !== 'undefined' ? process.env?.AUTHORIZED_CHATS : undefined);
    if (!envVar) return [];
    return envVar.split(",").map(id => id.trim()).filter(Boolean);
}

export function authMiddleware(ctx, next) {
    const authorizedChats = getAuthorizedChats(ctx);
    if (authorizedChats.length > 0 && ctx?.chat) {
        if (!authorizedChats.includes(ctx.chat.id.toString())) {
            return ctx.reply("You are not authorized to use this bot ❌");
        }
    }
    return next();
}
