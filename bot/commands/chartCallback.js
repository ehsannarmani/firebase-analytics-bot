import { AuthorizedChatRepository } from "../db/authorizedChatRepository.js";
import { getReportContext } from "../services/reportCache.js";
import { buildChartConfig } from "../services/chartDataBuilder.js";
import { renderChartImage } from "../services/chartRenderer.js";

/**
 * Sets up global handler for interactive '📈 View as Chart' buttons.
 */
export function setupChartCallback(bot) {
    bot.on("callback_query:data", async (ctx, next) => {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith("chart:")) {
            return next();
        }

        // 1. Authorization check
        const authRepo = new AuthorizedChatRepository(ctx.env);
        const isAuth = await authRepo.isChatAuthorized(ctx);
        if (!isAuth) {
            await ctx.answerCallbackQuery({
                text: "⛔️ Unauthorized: You do not have permission to view analytics charts.",
                show_alert: true,
            });
            return;
        }

        const reportId = data.replace("chart:", "").trim();

        // 2. Acknowledge button press immediately
        try {
            await ctx.answerCallbackQuery({ text: "📊 Generating chart..." });
        } catch (e) {
            // Ignore if answerCallbackQuery fails
        }

        // 3. Retrieve report context
        const context = await getReportContext(ctx.env, reportId);
        if (!context || !context.results) {
            await ctx.reply(
                "⚠️ <b>This report has expired.</b>\n\n" +
                "Please run the analytics command again to generate a fresh report and chart.",
                { parse_mode: "HTML" }
            );
            return;
        }

        // 4. Build chart configuration
        const chartConfig = buildChartConfig(context.type, context.results, context.metadata);
        if (!chartConfig) {
            await ctx.reply("❌ <i>Unable to generate chart from the available statistics.</i>", { parse_mode: "HTML" });
            return;
        }

        const loadingMsg = await ctx.reply("📈 <i>Rendering high-definition chart...</i>", { parse_mode: "HTML" });

        try {
            const { inputFile, url } = await renderChartImage(chartConfig);
            const photoTarget = inputFile || url;

            if (!photoTarget) {
                throw new Error("Could not generate chart image.");
            }

            const projectName = context.metadata?.projectName ? ` (${context.metadata.projectName})` : '';
            const caption = `📈 <b>Visual Report Chart${projectName}</b>\n<i>Generated from live Firebase Analytics data.</i>`;

            await ctx.replyWithPhoto(photoTarget, {
                caption,
                parse_mode: "HTML",
                reply_parameters: ctx.callbackQuery.message?.message_id ? { message_id: ctx.callbackQuery.message.message_id } : undefined,
            });
        } catch (error) {
            console.error("Error sending chart photo:", error);
            await ctx.reply("❌ <b>Unable to generate the chart right now.</b> Please try running the command again.", { parse_mode: "HTML" });
        } finally {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id);
            } catch (e) {
                // Ignore deletion error
            }
        }
    });
}
