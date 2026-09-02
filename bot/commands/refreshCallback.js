import { AuthorizedChatRepository } from "../db/authorizedChatRepository.js";
import { getReportContext } from "../services/reportCache.js";

// Lazy-load report generators to avoid circular dependencies
async function getGenerators() {
    const [
        dailyMod,
        newUsersMod,
        min30Mod,
        usersMod,
        engagementMod,
        countriesMod,
        versionsMod,
        compareMod,
        eventsMod,
        liveMod,
    ] = await Promise.all([
        import("./daily.js"),
        import("./newUsers.js"),
        import("./min30.js"),
        import("./users.js"),
        import("./engagement.js"),
        import("./countries.js"),
        import("./versions.js"),
        import("./compare.js"),
        import("./events.js"),
        import("./live.js"),
    ]);

    return {
        daily: dailyMod.generateDailyReport,
        new_users: newUsersMod.generateNewUsersReport,
        min30: min30Mod.generateMin30Report,
        users: usersMod.generateUsersReport,
        engagement: engagementMod.generateEngagementReport,
        countries: countriesMod.generateCountriesReport,
        versions: versionsMod.generateVersionsReport,
        compare: compareMod.generateCompareReport,
        events: eventsMod.generateEventsReport,
        live: liveMod.generateLiveReport,
    };
}

/**
 * Builds safe refresh callback_data string ensuring it stays within Telegram's 64-byte limit.
 */
export function buildRefreshCallback(type, params = {}, reportId = null) {
    let raw = "";

    switch (type) {
        case "daily":
            raw = `ref:daily:${params.days || 7}:${params.projectArg || ""}`;
            break;
        case "new_users":
            raw = `ref:new:${params.days || 7}:${params.projectArg || ""}`;
            break;
        case "min30":
            raw = `ref:min30:${params.projectArg || ""}`;
            break;
        case "users":
            raw = `ref:users:${params.projectArg || ""}`;
            break;
        case "engagement":
            raw = `ref:eng:${params.projectArg || ""}`;
            break;
        case "versions":
            raw = `ref:ver:${params.projectArg || ""}`;
            break;
        case "compare":
            raw = `ref:comp:${params.days || 7}:${params.projectArg || ""}`;
            break;
        case "live":
            raw = `ref:live:${params.projectArg || ""}`;
            break;
        case "countries": {
            const list = (params.requestedCountries || []).join(",");
            raw = `ref:cntry:${params.projectArg || ""}:${list}`;
            break;
        }
        case "events": {
            const args = params.commandArgs || [];
            if (args.length === 0) {
                raw = `ref:ev:top:${params.projectArg || ""}`;
            } else if (args.length === 1) {
                raw = `ref:ev:disc:${params.projectArg || ""}:${args[0]}`;
            } else if (args.length === 2) {
                raw = `ref:ev:sp:${params.projectArg || ""}:${args[0]}:${args[1]}`;
            } else {
                raw = `ref:ev:mp:${params.projectArg || ""}:${args[0]}:${args[1]}:${args[2]}`;
            }
            break;
        }
        default:
            raw = `ref:${type}:${params.projectArg || ""}`;
    }

    // Check byte length against Telegram's 64-byte limit (keep buffer of safety at 60 bytes)
    const byteLength = new TextEncoder().encode(raw).length;
    if (byteLength <= 60) {
        return raw;
    }

    // Fallback to report cache reference if query parameters exceed length limit
    if (reportId) {
        return `ref:q:${reportId}`;
    }

    // Truncate safely if no reportId available
    return raw.slice(0, 60);
}

/**
 * Registers global handler for interactive analytics refresh callbacks: ref:*
 */
export function setupRefreshCallback(bot) {
    bot.on("callback_query:data", async (ctx, next) => {
        const data = ctx.callbackQuery.data;
        if (!data.startsWith("ref:")) {
            return next();
        }

        // 1. Authorization check
        const authRepo = new AuthorizedChatRepository(ctx.env);
        const isAuth = await authRepo.isChatAuthorized(ctx);
        if (!isAuth) {
            await ctx.answerCallbackQuery({
                text: "⛔️ Unauthorized: You do not have permission to refresh analytics reports.",
                show_alert: true,
            });
            return;
        }

        // 2. Acknowledge button press immediately
        try {
            await ctx.answerCallbackQuery({ text: "🔄 Refreshing data..." });
        } catch (e) {
            // Ignore if answerCallbackQuery fails
        }

        const generators = await getGenerators();
        let report = null;

        try {
            const parts = data.split(":");
            const subType = parts[1];

            // Case A: Query reference from report cache: ref:q:<reportId>
            if (subType === "q") {
                const reportId = parts[2];
                const context = await getReportContext(ctx.env, reportId);
                if (!context || !context.metadata?.queryParams) {
                    await ctx.reply(
                        "⚠️ <b>This report session has expired.</b>\n\n" +
                        "Please run the analytics command again to generate a fresh report.",
                        { parse_mode: "HTML" }
                    );
                    return;
                }

                const { type, ...params } = context.metadata.queryParams;
                const generator = generators[type];
                if (generator) {
                    report = await generator(ctx.env, params);
                }
            }
            // Case B: Daily Active Users: ref:daily:<days>:<projectArg>
            else if (subType === "daily") {
                const days = parseInt(parts[2], 10) || 7;
                const projectArg = parts.slice(3).join(":");
                report = await generators.daily(ctx.env, { projectArg, days });
            }
            // Case C: Daily New Users: ref:new:<days>:<projectArg>
            else if (subType === "new") {
                const days = parseInt(parts[2], 10) || 7;
                const projectArg = parts.slice(3).join(":");
                report = await generators.new_users(ctx.env, { projectArg, days });
            }
            // Case D: Min30 Active Users: ref:min30:<projectArg>
            else if (subType === "min30") {
                const projectArg = parts.slice(2).join(":");
                report = await generators.min30(ctx.env, { projectArg });
            }
            // Case E: Lifetime Active Users: ref:users:<projectArg>
            else if (subType === "users") {
                const projectArg = parts.slice(2).join(":");
                report = await generators.users(ctx.env, { projectArg });
            }
            // Case F: Engagement Time: ref:eng:<projectArg>
            else if (subType === "eng") {
                const projectArg = parts.slice(2).join(":");
                report = await generators.engagement(ctx.env, { projectArg });
            }
            // Case G: Countries: ref:cntry:<projectArg>:<country1,country2>
            else if (subType === "cntry") {
                const projectArg = parts[2] || "";
                const countriesRaw = parts[3] || "";
                const requestedCountries = countriesRaw ? countriesRaw.split(",").map(c => c.trim()).filter(Boolean) : [];
                report = await generators.countries(ctx.env, { projectArg, requestedCountries });
            }
            // Case H: Versions: ref:ver:<projectArg>
            else if (subType === "ver") {
                const projectArg = parts.slice(2).join(":");
                report = await generators.versions(ctx.env, { projectArg });
            }
            // Case I: Compare: ref:comp:<days>:<projectArg>
            else if (subType === "comp") {
                const days = parseInt(parts[2], 10) || 7;
                const projectArg = parts.slice(3).join(":");
                report = await generators.compare(ctx.env, { projectArg, days });
            }
            // Case J: Live: ref:live:<projectArg>
            else if (subType === "live") {
                const projectArg = parts.slice(2).join(":");
                report = await generators.live(ctx.env, { projectArg });
            }
            // Case K: Events: ref:ev:<mode>:<projectArg>:<args...>
            else if (subType === "ev") {
                const mode = parts[2];
                const projectArg = parts[3] || "";
                const restArgs = parts.slice(4);

                let commandArgs = [];
                if (mode === "disc" && restArgs[0]) {
                    commandArgs = [restArgs[0]];
                } else if (mode === "sp" && restArgs[0] && restArgs[1]) {
                    commandArgs = [restArgs[0], restArgs[1]];
                } else if (mode === "mp" && restArgs[0] && restArgs[1] && restArgs[2]) {
                    commandArgs = [restArgs[0], restArgs[1], restArgs[2]];
                }

                report = await generators.events(ctx.env, { projectArg, commandArgs });
            }

            if (!report || !report.text) {
                return;
            }

            // Edit message in place
            try {
                await ctx.editMessageText(report.text, {
                    parse_mode: "HTML",
                    reply_markup: report.keyboard,
                });
            } catch (editErr) {
                if (editErr.message?.includes("message is not modified")) {
                    try {
                        await ctx.answerCallbackQuery({ text: "✅ Report is already up to date!" });
                    } catch (e) {}
                } else {
                    console.error("Error editing refreshed message:", editErr);
                }
            }
        } catch (err) {
            console.error("Error in refresh callback handler:", err);
            try {
                await ctx.reply(`❌ Failed to refresh report: ${err.message}`);
            } catch (e) {}
        }
    });
}
