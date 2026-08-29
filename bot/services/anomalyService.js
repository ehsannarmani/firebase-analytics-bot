import { InlineKeyboard } from "grammy";
import { FirebaseAccountRepository } from "../db/accountRepository.js";
import { SettingsRepository } from "../db/settingsRepository.js";
import { StateRepository } from "../db/stateRepository.js";
import { getTrafficAnomalyMetrics, getAccountsForExecution } from "./analytics.js";
import { saveReportContext } from "./reportCache.js";
import { getFormattedDate } from "./dateUtils.js";

const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Evaluates active traffic against rolling baseline and fires alerts if ±40% deviation occurs.
 */
export async function checkTrafficAnomalies(bot, env) {
    const settingsRepo = new SettingsRepository(env);
    const { channelId } = await settingsRepo.getUpdateChannelId(env);
    const adminChatId = env.MAIN_ADMIN_CHAT_ID ? String(env.MAIN_ADMIN_CHAT_ID).split(",")[0].trim() : null;

    let accounts = [];
    try {
        const repo = new FirebaseAccountRepository(env);
        accounts = await repo.getEnabled();
    } catch (e) {
        accounts = await getAccountsForExecution(env);
    }

    if (!accounts || accounts.length === 0) return;

    const stateRepo = new StateRepository(env);

    for (const account of accounts) {
        try {
            const anomaly = await getTrafficAnomalyMetrics(account);
            if (!anomaly || !anomaly.isAnomaly) continue;

            const stateKey = `anomaly_cd_${account.id}`;
            const lastState = await stateRepo.getState(stateKey);
            const now = Date.now();

            if (lastState && lastState.data) {
                const lastSentAt = Number(lastState.data.timestamp) || 0;
                if (now - lastSentAt < COOLDOWN_MS) {
                    // Within 2-hour cooldown period, avoid duplicate alert
                    continue;
                }
            }

            // Save cooldown state
            await stateRepo.setState(stateKey, 'cooldown', {
                timestamp: now,
                type: anomaly.type,
                deltaPercent: anomaly.deltaPercent
            });

            // Format alert
            const isSpike = anomaly.type === 'spike';
            const icon = isSpike ? "⚡️ <b>TRAFFIC SPIKE DETECTED!</b>" : "🔻 <b>TRAFFIC DROP DETECTED!</b>";
            const sign = anomaly.deltaPercent > 0 ? `+${anomaly.deltaPercent}%` : `${anomaly.deltaPercent}%`;
            const badge = isSpike ? "🟢" : "🔴";

            let alertMsg = `${icon}\n━━━━━━━━━━━━━━━━━━\n` +
                           `🔥 <b>Project:</b> <b>${account.name}</b>\n\n` +
                           `📍 <b>Current (Last 30 Min):</b> <code>${anomaly.current.toLocaleString()}</code> active users\n` +
                           `📊 <b>Expected Baseline:</b> ~<code>${anomaly.baseline.toLocaleString()}</code> active users\n` +
                           `📈 <b>Deviation:</b> ${badge} <b>${sign}</b>\n\n` +
                           `🕒 <i>Detected at ${getFormattedDate()}</i>`;

            // Prepare chart context
            const reportId = await saveReportContext(env, 'min30', [{
                account,
                success: true,
                data: anomaly.current
            }], { isFiltered: true, projectName: account.name });

            const keyboard = new InlineKeyboard()
                .text("📈 View Live Chart", `chart:${reportId}`)
                .row()
                .text(`📊 ${account.name} Daily Report`, `proj:run:daily:${account.id}`);

            // Send to configured Report Channel
            if (channelId) {
                try {
                    await bot.api.sendMessage(channelId, alertMsg, { parse_mode: "HTML", reply_markup: keyboard });
                } catch (chErr) {
                    console.error("Could not send anomaly alert to channel:", chErr.message);
                }
            }

            // Also send to Main Admin privately if different from channel
            if (adminChatId && adminChatId !== channelId) {
                try {
                    await bot.api.sendMessage(adminChatId, `⚠️ <i>[Admin Alert]</i>\n${alertMsg}`, {
                        parse_mode: "HTML",
                        reply_markup: keyboard
                    });
                } catch (admErr) {
                    console.error("Could not send anomaly alert to Main Admin:", admErr.message);
                }
            }
        } catch (err) {
            console.error(`Error checking anomaly for ${account.name}:`, err.message);
        }
    }
}
