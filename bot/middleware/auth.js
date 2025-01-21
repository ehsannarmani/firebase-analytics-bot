const authorizedChats = process.env.AUTHORIZED_CHATS.split(",");

function authMiddleware(ctx, next) {
    if (!authorizedChats.includes(ctx.chat.id.toString())) {
        return ctx.reply("You are not authorized to use this bot ❌");
    }
    return next();
}

module.exports = { authMiddleware };
