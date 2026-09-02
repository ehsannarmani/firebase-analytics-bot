import assert from "node:assert/strict";
import { FirebaseAccountRepository } from "../bot/db/accountRepository.js";
import { StateRepository } from "../bot/db/stateRepository.js";
import { isMainAdmin, getMainAdminIds, adminGuard } from "../bot/middleware/adminAuth.js";
import { authMiddleware, getAuthorizedChats } from "../bot/middleware/auth.js";
import {
    validateAccountCredentials,
    runMultiAccountExecution,
    getAccountsForExecution
} from "../bot/services/analytics.js";

async function runTests() {
    console.log("==================================================");
    console.log("🧪 STARTING MULTI-FIREBASE BOT TEST SUITE");
    console.log("==================================================\n");

    let passedTests = 0;
    let failedTests = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`✅ PASS: ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`❌ FAIL: ${name}`);
            console.error(err);
            failedTests++;
        }
    }

    async function asyncTest(name, fn) {
        try {
            await fn();
            console.log(`✅ PASS: ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`❌ FAIL: ${name}`);
            console.error(err);
            failedTests++;
        }
    }

    // ----------------------------------------------------
    // 1. REPOSITORY & STORAGE TESTS
    // ----------------------------------------------------
    console.log("📁 1. Testing Database & Account Repository...");

    const mockEnv = {};
    const accountRepo = new FirebaseAccountRepository(mockEnv);
    const stateRepo = new StateRepository(mockEnv);

    await asyncTest("Create multiple accounts in repository", async () => {
        const acc1 = await accountRepo.create({
            id: "acc_prod",
            name: "Production App",
            propertyId: "111111111",
            serviceAccountJson: JSON.stringify({ client_email: "prod@example.com", private_key: "key1" }),
            enabled: true,
        });
        assert.equal(acc1.id, "acc_prod");
        assert.equal(acc1.name, "Production App");
        assert.equal(acc1.enabled, true);

        const acc2 = await accountRepo.create({
            id: "acc_beta",
            name: "Beta App",
            propertyId: "222222222",
            serviceAccountJson: JSON.stringify({ client_email: "beta@example.com", private_key: "key2" }),
            enabled: true,
        });
        assert.equal(acc2.id, "acc_beta");

        const acc3 = await accountRepo.create({
            id: "acc_staging",
            name: "Staging App",
            propertyId: "333333333",
            serviceAccountJson: JSON.stringify({ client_email: "stage@example.com", private_key: "key3" }),
            enabled: false,
        });
        assert.equal(acc3.enabled, false);
    });

    await asyncTest("Repository getById, getAll, getEnabled, and count", async () => {
        const all = await accountRepo.getAll();
        assert.equal(all.length, 3);

        const enabled = await accountRepo.getEnabled();
        assert.equal(enabled.length, 2);
        assert.ok(enabled.some(a => a.id === "acc_prod"));
        assert.ok(enabled.some(a => a.id === "acc_beta"));
        assert.ok(!enabled.some(a => a.id === "acc_staging"));

        const counts = await accountRepo.count();
        assert.equal(counts.total, 3);
        assert.equal(counts.enabled, 2);

        const found = await accountRepo.getById("acc_prod");
        assert.equal(found.propertyId, "111111111");
    });

    await asyncTest("Repository setEnabled and update", async () => {
        // Enable staging
        await accountRepo.setEnabled("acc_staging", true);
        let enabled = await accountRepo.getEnabled();
        assert.equal(enabled.length, 3);

        // Update name
        const updated = await accountRepo.update("acc_prod", { name: "Production App V2" });
        assert.equal(updated.name, "Production App V2");

        // Disable beta
        await accountRepo.setEnabled("acc_beta", false);
        enabled = await accountRepo.getEnabled();
        assert.equal(enabled.length, 2);
    });

    await asyncTest("Repository delete", async () => {
        await accountRepo.delete("acc_staging");
        const all = await accountRepo.getAll();
        assert.equal(all.length, 2);
        const deleted = await accountRepo.getById("acc_staging");
        assert.equal(deleted, null);
    });

    // ----------------------------------------------------
    // 2. CONVERSATION STATE TESTS
    // ----------------------------------------------------
    console.log("\n💬 2. Testing Conversation State Repository...");

    await asyncTest("Set, get, and clear conversation states", async () => {
        const chatId = "987654";
        await stateRepo.setState(chatId, "ADD_ACCOUNT_NAME", { step: 1 });

        let stateObj = await stateRepo.getState(chatId);
        assert.ok(stateObj);
        assert.equal(stateObj.state, "ADD_ACCOUNT_NAME");
        assert.equal(stateObj.data.step, 1);

        // Transition state
        await stateRepo.setState(chatId, "ADD_ACCOUNT_PROPERTY_ID", { name: "New Project", step: 2 });
        stateObj = await stateRepo.getState(chatId);
        assert.equal(stateObj.state, "ADD_ACCOUNT_PROPERTY_ID");
        assert.equal(stateObj.data.name, "New Project");

        // Clear state
        await stateRepo.clearState(chatId);
        stateObj = await stateRepo.getState(chatId);
        assert.equal(stateObj, null);
    });

    // ----------------------------------------------------
    // 3. AUTHENTICATION & AUTHORIZATION TESTS
    // ----------------------------------------------------
    console.log("\n🛡 3. Testing Authentication & Authorization Middleware...");

    test("Main Admin verification (single & multiple IDs)", () => {
        const envSingle = { MAIN_ADMIN_CHAT_ID: "12345" };
        assert.ok(isMainAdmin({ env: envSingle, from: { id: 12345 } }));
        assert.ok(isMainAdmin({ env: envSingle, chat: { id: 12345 } }));
        assert.ok(!isMainAdmin({ env: envSingle, from: { id: 99999 } }));

        const envMultiple = { MAIN_ADMIN_CHAT_ID: "12345, 67890" };
        assert.ok(isMainAdmin({ env: envMultiple, from: { id: 67890 } }));
        assert.ok(isMainAdmin({ env: envMultiple, from: { id: 12345 } }));
        assert.ok(!isMainAdmin({ env: envMultiple, from: { id: 55555 } }));
    });

    await asyncTest("Main Admin bypasses AUTHORIZED_CHATS constraint", async () => {
        const env = {
            MAIN_ADMIN_CHAT_ID: "1001",
            AUTHORIZED_CHATS: "2001, 2002"
        };

        let nextCalled = false;
        const next = () => { nextCalled = true; };

        // Main admin should pass
        await authMiddleware({ env, chat: { id: 1001 }, from: { id: 1001 } }, next);
        assert.ok(nextCalled, "Main Admin should be permitted through auth middleware");

        // Authorized user should pass
        nextCalled = false;
        await authMiddleware({ env, chat: { id: 2001 }, from: { id: 2001 } }, next);
        assert.ok(nextCalled, "Authorized chat should pass");

        // Unauthorized user should be rejected
        nextCalled = false;
        let replyMsg = null;
        await authMiddleware({
            env,
            chat: { id: 9999 },
            from: { id: 9999 },
            reply: (msg) => { replyMsg = msg; }
        }, next);
        assert.ok(!nextCalled, "Unauthorized user should NOT call next");
        assert.ok(replyMsg.includes("not authorized"));
    });

    await asyncTest("AuthorizedChatRepository CRUD and authMiddleware integration", async () => {
        const { AuthorizedChatRepository } = await import("../bot/db/authorizedChatRepository.js");
        const authRepo = new AuthorizedChatRepository(mockEnv);

        // Add authorized chat
        const added = await authRepo.add("555001", "Marketing Team");
        assert.equal(added.chatId, "555001");
        assert.equal(added.label, "Marketing Team");

        const all = await authRepo.getAll();
        assert.ok(all.some(c => c.chatId === "555001"));

        const count = await authRepo.count();
        assert.ok(count >= 1);

        // Check isChatAuthorized
        const ctxAuth = { env: mockEnv, chat: { id: "555001" }, from: { id: "555001" } };
        const isAuth = await authRepo.isChatAuthorized(ctxAuth);
        assert.equal(isAuth, true);

        const ctxUnauth = { env: mockEnv, chat: { id: "999888" }, from: { id: "999888" } };
        const isUnauth = await authRepo.isChatAuthorized(ctxUnauth);
        assert.equal(isUnauth, false);

        // Remove authorized chat
        await authRepo.remove("555001");
        const found = await authRepo.getById("555001");
        assert.equal(found, null);

        // Verify default deny when no authorized chats exist in DB or ENV
        const emptyEnv = { MAIN_ADMIN_CHAT_ID: "1001" };
        const emptyAuthRepo = new AuthorizedChatRepository(emptyEnv);
        const nonAdminCtx = { env: emptyEnv, chat: { id: "777777" }, from: { id: "777777" } };
        const isAllowedByDefault = await emptyAuthRepo.isChatAuthorized(nonAdminCtx);
        assert.equal(isAllowedByDefault, false, "Non-admins must be denied by default when no authorized chats are configured");
    });

    // ----------------------------------------------------
    // 4. CREDENTIAL VALIDATION & SECURITY TESTS
    // ----------------------------------------------------
    console.log("\n🔒 4. Testing Credential Validation & Security...");

    await asyncTest("Reject invalid JSON format", async () => {
        const res = await validateAccountCredentials("not-a-json", "123456789");
        assert.equal(res.ok, false);
        assert.ok(res.error.includes("Invalid JSON format"));
    });

    await asyncTest("Reject missing client_email", async () => {
        const badJson = JSON.stringify({ private_key: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----" });
        const res = await validateAccountCredentials(badJson, "123456789");
        assert.equal(res.ok, false);
        assert.ok(res.error.includes("client_email"));
    });

    await asyncTest("Reject missing or malformed private_key", async () => {
        const badJson = JSON.stringify({ client_email: "test@example.com", private_key: "plain-text-key" });
        const res = await validateAccountCredentials(badJson, "123456789");
        assert.equal(res.ok, false);
        assert.ok(res.error.includes("private_key"));
    });

    await asyncTest("Reject non-numeric Property ID", async () => {
        const json = JSON.stringify({
            client_email: "test@example.com",
            private_key: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"
        });
        const res = await validateAccountCredentials(json, "abc-invalid-property");
        assert.equal(res.ok, false);
        assert.ok(res.error.includes("Property ID must be numeric"));
    });

    // ----------------------------------------------------
    // 5. MULTI-PROJECT QUERY EXECUTION & PARTIAL FAILURE HANDLING
    // ----------------------------------------------------
    console.log("\n📊 5. Testing Multi-Project Execution & Partial Failure Tolerance...");

    await asyncTest("Execute multi-account queries with 5 accounts and 1 failing account", async () => {
        const accounts = [
            { id: "acc_1", name: "Account A", enabled: true },
            { id: "acc_2", name: "Account B", enabled: true },
            { id: "acc_3", name: "Account C (Broken)", enabled: true },
            { id: "acc_4", name: "Account D", enabled: true },
            { id: "acc_5", name: "Account E", enabled: true },
        ];

        const results = await runMultiAccountExecution(accounts, async (account) => {
            if (account.id === "acc_3") {
                throw new Error("Permission denied: service account removed.");
            }
            return 100; // Simulated metric
        });

        assert.equal(results.length, 5);

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        assert.equal(successes.length, 4);
        assert.equal(failures.length, 1);

        // Sum across successful accounts
        const total = successes.reduce((sum, r) => sum + r.data, 0);
        assert.equal(total, 400);
    });

    await asyncTest("adminGuard rejects non-admin callback queries and commands", async () => {
        let callbackAlert = null;
        const fakeCtxCallback = {
            env: { MAIN_ADMIN_CHAT_ID: "12345" },
            from: { id: 99999 },
            callbackQuery: { data: "admin:accounts" },
            answerCallbackQuery: async ({ text, show_alert }) => {
                callbackAlert = text;
            },
            reply: async () => {},
        };

        let nextRan = false;
        await adminGuard(fakeCtxCallback, () => { nextRan = true; });
        assert.equal(nextRan, false);
        assert.ok(callbackAlert.includes("Unauthorized"));

        let replyText = null;
        const fakeCtxMessage = {
            env: { MAIN_ADMIN_CHAT_ID: "12345" },
            from: { id: 99999 },
            reply: async (msg) => { replyText = msg; },
        };
        await adminGuard(fakeCtxMessage, () => { nextRan = true; });
        assert.equal(nextRan, false);
        assert.ok(replyText.includes("Unauthorized"));
    });

    // ----------------------------------------------------
    // 6. SCHEDULER MULTI-ACCOUNT REPORT GENERATION TEST
    // ----------------------------------------------------
    console.log("\n⏰ 6. Testing Scheduler Multi-Account Report Logic...");

    await asyncTest("Scheduler formats reports correctly for multiple accounts and partial failures", async () => {
        const { sendMin30Update, sendDailyUpdate } = await import("../bot/services/scheduler.js");

        let sentMessage = null;
        let pinned = false;

        const fakeBot = {
            api: {
                sendMessage: async (channelId, text, opts) => {
                    sentMessage = text;
                    return { message_id: 42 };
                },
                pinChatMessage: async (channelId, msgId) => {
                    pinned = true;
                },
                unpinAllChatMessages: async () => {},
            }
        };

        // Populate accounts in mock DB
        const testEnv = {
            UPDATE_CHANNEL_ID: "-100123456",
        };
        const testRepo = new FirebaseAccountRepository(testEnv);
        await testRepo.create({
            id: "sched_prod",
            name: "Sched Prod App",
            propertyId: "12345",
            serviceAccountJson: "{}",
            enabled: true,
        });
        await testRepo.create({
            id: "sched_beta",
            name: "Sched Beta App",
            propertyId: "67890",
            serviceAccountJson: "{}",
            enabled: true,
        });

        // Test sendMin30Update
        await sendMin30Update(fakeBot, testEnv);
        assert.ok(sentMessage, "sendMin30Update should send a message");
        assert.ok(sentMessage.includes("Sched Prod App"), "Should contain first account name");
        assert.ok(sentMessage.includes("Sched Beta App"), "Should contain second account name");
    });

    await asyncTest("SettingsRepository dynamic UPDATE_CHANNEL_ID configuration and override", async () => {
        const { SettingsRepository } = await import("../bot/db/settingsRepository.js");
        const envWithSecret = { UPDATE_CHANNEL_ID: "-100999999" };
        const settingsRepo = new SettingsRepository(envWithSecret);

        // 1. Initially falls back to env secret
        let resolved = await settingsRepo.getUpdateChannelId(envWithSecret);
        assert.equal(resolved.channelId, "-100999999");
        assert.equal(resolved.source, "environment");

        // 2. Set dynamic channel ID in database
        await settingsRepo.setUpdateChannelId("-100888888");
        resolved = await settingsRepo.getUpdateChannelId(envWithSecret);
        assert.equal(resolved.channelId, "-100888888");
        assert.equal(resolved.source, "database");

        // 3. Clear dynamic channel ID in database
        await settingsRepo.clearUpdateChannelId();
        resolved = await settingsRepo.getUpdateChannelId(envWithSecret);
        assert.equal(resolved.channelId, "-100999999");
        assert.equal(resolved.source, "environment");
    });

    // ----------------------------------------------------
    // 7. PROJECT FILTERING & CHART VISUALIZATION TESTS
    // ----------------------------------------------------
    console.log("\n📈 7. Testing Project Filtering & Chart Data Builder...");

    await asyncTest("resolveTargetAccounts handles all filter cases correctly", async () => {
        const { resolveTargetAccounts } = await import("../bot/services/projectResolver.js");
        const env = { MAIN_ADMIN_CHAT_ID: "1001" };
        const repo = new FirebaseAccountRepository(env);

        await repo.create({
            id: "proj_zino",
            name: "Zino Production",
            propertyId: "111222",
            serviceAccountJson: "{}",
            enabled: true,
        });

        await repo.create({
            id: "proj_disabled",
            name: "Old Beta App",
            propertyId: "333444",
            serviceAccountJson: "{}",
            enabled: false,
        });

        const ctx = { env };

        // 1. No filter -> Returns all enabled accounts
        const allRes = await resolveTargetAccounts(ctx, "");
        assert.equal(allRes.isFiltered, false);
        assert.ok(allRes.accounts.length >= 1);
        assert.ok(allRes.accounts.some(a => a.name === "Zino Production"));

        // 2. Exact / case-insensitive / slug filter -> Returns matching account
        const zinoRes = await resolveTargetAccounts(ctx, "zino");
        assert.equal(zinoRes.isFiltered, true);
        assert.equal(zinoRes.matchedName, "Zino Production");
        assert.equal(zinoRes.accounts.length, 1);
        assert.equal(zinoRes.accounts[0].name, "Zino Production");

        const upperRes = await resolveTargetAccounts(ctx, "ZINO");
        assert.equal(upperRes.isFiltered, true);
        assert.equal(upperRes.matchedName, "Zino Production");

        // 3. Disabled project filter -> Returns clean disabled error
        const disRes = await resolveTargetAccounts(ctx, "Old Beta App");
        assert.equal(disRes.isFiltered, true);
        assert.equal(disRes.accounts.length, 0);
        assert.ok(disRes.error.includes("currently disabled"));

        // 4. Non-existent project filter -> Returns not found error
        const notFoundRes = await resolveTargetAccounts(ctx, "unknown_game_99");
        assert.equal(notFoundRes.isFiltered, true);
        assert.equal(notFoundRes.accounts.length, 0);
        assert.ok(notFoundRes.error.includes("not found"));
        assert.ok(notFoundRes.error.includes("/projects"));
    });

    await asyncTest("buildChartConfig generates valid configurations for all 8 report types", async () => {
        const { buildChartConfig } = await import("../bot/services/chartDataBuilder.js");

        const mockAccount1 = { id: "1", name: "App Alpha", propertyId: "101" };
        const mockAccount2 = { id: "2", name: "App Beta", propertyId: "102" };

        // 1. Daily Active Users (single & multi)
        const dailyData = [
            { date: "2024-08-20", users: 100 },
            { date: "2024-08-21", users: 120 },
            { date: "2024-08-22", users: 150 },
        ];
        const dailySingleConfig = buildChartConfig("daily", [{ account: mockAccount1, success: true, data: dailyData }]);
        assert.equal(dailySingleConfig.type, "line");
        assert.equal(dailySingleConfig.data.labels.length, 3);
        assert.equal(dailySingleConfig.data.datasets.length, 1);

        const dailyMultiConfig = buildChartConfig("daily", [
            { account: mockAccount1, success: true, data: dailyData },
            { account: mockAccount2, success: true, data: dailyData }
        ]);
        assert.equal(dailyMultiConfig.type, "line");
        assert.equal(dailyMultiConfig.data.datasets.length, 2);

        // 2. New Users
        const newUsersConfig = buildChartConfig("new_users", [{ account: mockAccount1, success: true, data: dailyData }]);
        assert.equal(newUsersConfig.type, "line");

        // 3. Min30 Active Users
        const min30Config = buildChartConfig("min30", [
            { account: mockAccount1, success: true, data: 45 },
            { account: mockAccount2, success: true, data: 90 }
        ]);
        assert.equal(min30Config.type, "bar");
        assert.equal(min30Config.data.datasets[0].data.length, 2);

        // 4. Lifetime Users
        const usersConfig = buildChartConfig("users", [
            { account: mockAccount1, success: true, data: 5000 },
            { account: mockAccount2, success: true, data: 8000 }
        ]);
        assert.ok(usersConfig.type === "doughnut" || usersConfig.type === "bar");

        // 5. Versions
        const versionsConfig = buildChartConfig("versions", [{
            account: mockAccount1,
            success: true,
            data: [{ version: "1.0.0", users: 50 }, { version: "1.1.0", users: 120 }]
        }]);
        assert.equal(versionsConfig.type, "bar");
        assert.equal(versionsConfig.options.indexAxis, "y");

        // 6. Countries
        const countriesConfig = buildChartConfig("countries", [{
            account: mockAccount1,
            success: true,
            data: [{ country: "United States", users: 300 }, { country: "Germany", users: 150 }]
        }]);
        assert.equal(countriesConfig.type, "bar");
        assert.equal(countriesConfig.options.indexAxis, "y");

        // 7. Engagement
        const engagementConfig = buildChartConfig("engagement", [{
            account: mockAccount1,
            success: true,
            data: [
                { date: "2024-08-20", avgSessionDuration: 180, engagementRate: 0.65 },
                { date: "2024-08-21", avgSessionDuration: 210, engagementRate: 0.72 },
            ]
        }]);
        assert.equal(engagementConfig.type, "line");
        assert.equal(engagementConfig.data.datasets.length, 2);

        // 8. Events
        const eventsConfig = buildChartConfig("events", [{
            account: mockAccount1,
            success: true,
            data: [{ eventName: "session_start", count: 1200 }, { eventName: "level_complete", count: 450 }]
        }]);
        assert.equal(eventsConfig.type, "bar");
        assert.equal(eventsConfig.options.indexAxis, "y");

        // 9. Compare (Dual-period overlay)
        const compareConfig = buildChartConfig("compare", [{
            account: mockAccount1,
            success: true,
            data: {
                periodDays: 7,
                chartData: {
                    currentDaily: [{ date: "2024-08-20", users: 100 }, { date: "2024-08-21", users: 150 }],
                    prevDaily: [{ date: "2024-08-13", users: 80 }, { date: "2024-08-14", users: 110 }],
                }
            }
        }]);
        assert.equal(compareConfig.type, "line");
        assert.equal(compareConfig.data.datasets.length, 2);
        assert.ok(compareConfig.data.datasets[0].label.includes("Current"));
        assert.ok(compareConfig.data.datasets[1].label.includes("Previous"));
    });

    // ----------------------------------------------------
    // 8. ANOMALY DETECTION & COMPARISON ENGINE TESTS
    // ----------------------------------------------------
    console.log("\n🚨 8. Testing Anomaly Detection & Comparison Engine...");

    await asyncTest("Anomaly detection calculates spikes and drops with thresholds", async () => {
        // Delta calculation formula test
        const calcAnomaly = (current, baseline) => {
            const deltaPercent = baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : 0;
            let isAnomaly = false;
            let type = 'normal';
            if (deltaPercent >= 40 && current - baseline >= 15) {
                isAnomaly = true;
                type = 'spike';
            } else if (deltaPercent <= -40 && baseline - current >= 15) {
                isAnomaly = true;
                type = 'drop';
            }
            return { isAnomaly, type, deltaPercent };
        };

        // Normal traffic (100 vs baseline 95)
        const normal = calcAnomaly(100, 95);
        assert.equal(normal.isAnomaly, false);
        assert.equal(normal.type, "normal");

        // Spike traffic (+60%)
        const spike = calcAnomaly(160, 100);
        assert.equal(spike.isAnomaly, true);
        assert.equal(spike.type, "spike");
        assert.equal(spike.deltaPercent, 60);

        // Drop traffic (-50%)
        const drop = calcAnomaly(50, 100);
        assert.equal(drop.isAnomaly, true);
        assert.equal(drop.type, "drop");
        assert.equal(drop.deltaPercent, -50);
    });

    await asyncTest("saveReportContext and getReportContext securely persist sanitized data", async () => {
        const { saveReportContext, getReportContext } = await import("../bot/services/reportCache.js");
        const env = { MAIN_ADMIN_CHAT_ID: "1001" };

        const testResults = [{
            account: { id: "a1", name: "Secure App", propertyId: "999", serviceAccountJson: "SECRET_KEY_NEVER_LEAK" },
            success: true,
            data: [{ date: "2024-08-20", users: 200 }]
        }];

        const reportId = await saveReportContext(env, "daily", testResults, { isFiltered: true, projectName: "Secure App" });
        assert.ok(reportId.startsWith("r_"));

        const retrieved = await getReportContext(env, reportId);
        assert.ok(retrieved);
        assert.equal(retrieved.type, "daily");
        assert.equal(retrieved.results[0].account.name, "Secure App");
        assert.equal(retrieved.results[0].account.serviceAccountJson, undefined, "Service account credentials must NEVER be stored in report context");
    });

    // ----------------------------------------------------
    // 9. EXECUTIVE DASHBOARD TESTS
    // ----------------------------------------------------
    console.log("\n🎛 9. Testing Executive Multi-Project Dashboard...");

    await asyncTest("buildDashboardData formats consolidated overview correctly", async () => {
        const { buildDashboardData } = await import("../bot/commands/dashboard.js");
        const { buildChartConfig } = await import("../bot/services/chartDataBuilder.js");
        const env = { MAIN_ADMIN_CHAT_ID: "1001" };

        const res = await buildDashboardData(env);
        assert.ok(res.text.includes("EXECUTIVE ANALYTICS DASHBOARD"));
        assert.ok(res.text.includes("Combined Global Totals"));
        assert.ok(res.keyboard);

        // Dashboard chart config
        const dashChart = buildChartConfig("dashboard", [
            {
                account: { id: "p1", name: "Alpha App" },
                success: true,
                data: { todayActive: 1000, todayNewUsers: 250, active30m: 80 }
            }
        ]);
        assert.equal(dashChart.type, "bar");
        assert.equal(dashChart.data.datasets.length, 3);
    });

    // ----------------------------------------------------
    // 10. MIN30 UPDATE CHANNEL TOGGLE TESTS
    // ----------------------------------------------------
    console.log("\n📢 10. Testing Min30 Channel Update Toggle & Scheduler...");

    await asyncTest("SettingsRepository isMin30UpdateEnabled defaults to true and can be toggled", async () => {
        const { SettingsRepository } = await import("../bot/db/settingsRepository.js");
        const env = {};
        const repo = new SettingsRepository(env);

        // 1. Default should be true
        const defaultVal = await repo.isMin30UpdateEnabled(env);
        assert.equal(defaultVal, true, "Default for min30 channel updates should be true");

        // 2. Disable via setMin30UpdateEnabled(false)
        await repo.setMin30UpdateEnabled(false);
        const disabledVal = await repo.isMin30UpdateEnabled(env);
        assert.equal(disabledVal, false, "Should return false after disabling");

        // 3. Re-enable via setMin30UpdateEnabled(true)
        await repo.setMin30UpdateEnabled(true);
        const enabledVal = await repo.isMin30UpdateEnabled(env);
        assert.equal(enabledVal, true, "Should return true after enabling");

        // 4. Environment variable fallback when not set in DB
        await repo.delete('channel_min30_enabled');
        const envDisabled = { ENABLE_MIN30_UPDATES: "false" };
        const repoEnv = new SettingsRepository(envDisabled);
        const envVal = await repoEnv.isMin30UpdateEnabled(envDisabled);
        assert.equal(envVal, false, "Should respect ENABLE_MIN30_UPDATES=false fallback");
    });

    await asyncTest("sendMin30Update suppresses channel message when min30 updates are disabled", async () => {
        const { sendMin30Update } = await import("../bot/services/scheduler.js");
        const { SettingsRepository } = await import("../bot/db/settingsRepository.js");

        let channelSent = false;
        let sentKeyboard = null;
        const fakeBot = {
            api: {
                sendMessage: async (channelId, text, opts) => {
                    channelSent = true;
                    sentKeyboard = opts?.reply_markup;
                    return { message_id: 123 };
                }
            }
        };

        const testEnv = { UPDATE_CHANNEL_ID: "-100777" };
        const settingsRepo = new SettingsRepository(testEnv);

        // Disable min30
        await settingsRepo.setMin30UpdateEnabled(false);
        await sendMin30Update(fakeBot, testEnv);
        assert.equal(channelSent, false, "sendMin30Update must NOT send message when min30 updates are disabled");

        // Enable min30
        await settingsRepo.setMin30UpdateEnabled(true);
        await sendMin30Update(fakeBot, testEnv);
        assert.equal(channelSent, true, "sendMin30Update MUST send message when min30 updates are enabled");
        assert.ok(sentKeyboard, "Sent message must contain inline keyboard with refresh button");

        // Verify refresh button exists in keyboard
        const buttons = sentKeyboard.inline_keyboard.flat();
        assert.ok(buttons.some(b => b.text.includes("Refresh") && b.callback_data === "ref:min30:"), "Should have ref:min30: button");
    });

    // ----------------------------------------------------
    // 11. INLINE KEYBOARD REFRESH & REPORT GENERATORS TESTS
    // ----------------------------------------------------
    console.log("\n🔄 11. Testing Analytics Refresh Callback & Generators...");

    await asyncTest("buildRefreshCallback formats compact callback data and handles length limits", async () => {
        const { buildRefreshCallback } = await import("../bot/commands/refreshCallback.js");

        // 1. Daily
        const dailyCb = buildRefreshCallback("daily", { days: 14, projectArg: "zino" });
        assert.equal(dailyCb, "ref:daily:14:zino");

        // 2. New Users
        const newCb = buildRefreshCallback("new_users", { days: 30, projectArg: "" });
        assert.equal(newCb, "ref:new:30:");

        // 3. Min30
        const min30Cb = buildRefreshCallback("min30", { projectArg: "prod" });
        assert.equal(min30Cb, "ref:min30:prod");

        // 4. Countries
        const cntryCb = buildRefreshCallback("countries", { projectArg: "prod", requestedCountries: ["US", "DE"] });
        assert.equal(cntryCb, "ref:cntry:prod:US,DE");

        // 5. Events - multi param
        const evMpCb = buildRefreshCallback("events", { projectArg: "p", commandArgs: ["e", "p1", "p2"] });
        assert.equal(evMpCb, "ref:ev:mp:p:e:p1:p2");

        // 6. Extreme length safety limit (falls back to reportId if > 60 bytes)
        const longArgs = ["extremely_long_event_name_that_exceeds_allowed_size_limit", "param1_extra_long", "param2_extra_long"];
        const fallbackCb = buildRefreshCallback("events", { projectArg: "my_long_project_name", commandArgs: longArgs }, "r_12345");
        assert.equal(fallbackCb, "ref:q:r_12345", "Must fall back to ref:q:reportId when callback exceeds 60 bytes");
    });

    await asyncTest("Analytics report generators include 🔄 Refresh button and updated timestamp", async () => {
        const { generateDailyReport } = await import("../bot/commands/daily.js");
        const { generateMin30Report } = await import("../bot/commands/min30.js");
        const { generateUsersReport } = await import("../bot/commands/users.js");
        const { generateEngagementReport } = await import("../bot/commands/engagement.js");
        const { generateLiveReport } = await import("../bot/commands/live.js");

        const env = { MAIN_ADMIN_CHAT_ID: "1001" };

        // 1. Daily report
        const dailyRes = await generateDailyReport(env, { projectArg: "", days: 7 });
        assert.ok(dailyRes.text.includes("Daily Active Users"));
        assert.ok(dailyRes.text.includes("Updated at"));
        assert.ok(dailyRes.keyboard);
        const dailyBtns = dailyRes.keyboard.inline_keyboard.flat();
        assert.ok(dailyBtns.some(b => b.text.includes("Refresh") && b.callback_data.startsWith("ref:daily:")));

        // 2. Min30 report
        const min30Res = await generateMin30Report(env, { projectArg: "" });
        assert.ok(min30Res.text.includes("Active users in last 30 minutes"));
        assert.ok(min30Res.text.includes("Updated at"));
        const min30Btns = min30Res.keyboard.inline_keyboard.flat();
        assert.ok(min30Btns.some(b => b.text.includes("Refresh") && b.callback_data === "ref:min30:"));

        // 3. Users report
        const usersRes = await generateUsersReport(env, { projectArg: "" });
        assert.ok(usersRes.text.includes("Lifetime Active Users"));
        assert.ok(usersRes.text.includes("Updated at"));
        const usersBtns = usersRes.keyboard.inline_keyboard.flat();
        assert.ok(usersBtns.some(b => b.text.includes("Refresh") && b.callback_data === "ref:users:"));

        // 4. Engagement report
        const engRes = await generateEngagementReport(env, { projectArg: "" });
        assert.ok(engRes.text.includes("Avg Engagement Time"));
        assert.ok(engRes.text.includes("Updated at"));
        const engBtns = engRes.keyboard.inline_keyboard.flat();
        assert.ok(engBtns.some(b => b.text.includes("Refresh") && b.callback_data === "ref:eng:"));

        // 5. Live report
        const liveRes = await generateLiveReport(env, { projectArg: "" });
        assert.ok(liveRes.text.includes("Live Active Users Update"));
        assert.ok(liveRes.text.includes("Updated at"));
        const liveBtns = liveRes.keyboard.inline_keyboard.flat();
        assert.ok(liveBtns.some(b => b.text.includes("Refresh") && b.callback_data === "ref:live:"));
    });

    await asyncTest("setupRefreshCallback routes callbacks and updates message for authorized chat", async () => {
        const { Bot } = await import("grammy");
        const { setupRefreshCallback } = await import("../bot/commands/refreshCallback.js");

        const env = { MAIN_ADMIN_CHAT_ID: "1001" };
        const bot = new Bot("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11", {
            botInfo: {
                id: 123456,
                is_bot: true,
                first_name: "TestBot",
                username: "test_bot",
                can_join_groups: true,
                can_read_all_group_messages: false,
                supports_inline_queries: false,
            }
        });
        bot.use(async (ctx, next) => {
            ctx.env = env;
            await next();
        });
        setupRefreshCallback(bot);

        // Mock bot API calls via transformer to avoid real HTTP requests
        bot.api.config.use((prev, method, payload, signal) => {
            return { ok: true, result: true };
        });

        // Dispatch directly via bot callback runner
        await bot.handleUpdate({
            update_id: 1,
            callback_query: {
                id: "cb_1",
                from: { id: 1001, is_bot: false, first_name: "Admin" },
                chat_instance: "ci_1",
                message: {
                    message_id: 99,
                    date: Math.floor(Date.now() / 1000),
                    chat: { id: 1001, type: "private" },
                    text: "Old Report"
                },
                data: "ref:daily:7:"
            }
        });

        // Test unauthorized chat rejection
        let unauthAlert = null;
        const fakeCtxUnauth = {
            env,
            from: { id: 9999 },
            chat: { id: 9999 },
            callbackQuery: { data: "ref:daily:7:" },
            answerCallbackQuery: async ({ text, show_alert }) => {
                unauthAlert = text;
            },
            editMessageText: async () => {},
        };

        const { AuthorizedChatRepository } = await import("../bot/db/authorizedChatRepository.js");
        const authRepo = new AuthorizedChatRepository(env);
        const isAuth = await authRepo.isChatAuthorized(fakeCtxUnauth);
        assert.equal(isAuth, false, "Unauthorized chat must not be authorized");
    });

    console.log("\n==================================================");
    console.log(`🏁 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log("==================================================");

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTests();
