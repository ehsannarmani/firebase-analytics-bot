import { isMainAdmin } from "./adminAuth.js";
import { AuthorizedChatRepository } from "../db/authorizedChatRepository.js";

export function getAuthorizedChats(ctx) {
    const envVar = ctx?.env?.AUTHORIZED_CHATS || (typeof process !== 'undefined' ? process.env?.AUTHORIZED_CHATS : undefined);
    if (!envVar) return [];
    return envVar.toString().split(",").map(id => id.trim()).filter(Boolean);
}

export async function authMiddleware(ctx, next) {
    // Main Admin is always authorized
    if (isMainAdmin(ctx)) {
        return next();
    }

    try {
        const authRepo = new AuthorizedChatRepository(ctx.env);
        const authorized = await authRepo.isChatAuthorized(ctx);

        if (!authorized && ctx?.chat) {
            return ctx.reply(`You (${ctx.chat.id.toString()}) are not authorized to use this bot ❌`);
        }
    } catch (err) {
        console.error("Error in authMiddleware:", err);
    }

    return next();
}
