import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { getLifetimeActiveUsers, getActiveUsersLast30Minutes, getAccountsForExecution } from '../bot/services/analytics.js';
import { FirebaseAccountRepository } from '../bot/db/accountRepository.js';

// Load .env and .dev.vars for local testing environment
dotenv.config({ path: '.env' });
if (existsSync('.dev.vars')) {
    const devVars = dotenv.parse(readFileSync('.dev.vars'));
    Object.assign(process.env, devVars);
}

async function testGoogleAnalytics() {
    console.log("🔍 Testing Google Analytics Service Account & Account Configuration...\n");

    const env = process.env;
    const repo = new FirebaseAccountRepository(env);
    const accounts = await repo.getAll();

    if (accounts.length > 0) {
        console.log(`✅ Found ${accounts.length} Firebase account(s) in database.\n`);

        for (const account of accounts) {
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`🔥 Account: ${account.name} (ID: ${account.id})`);
            console.log(`🆔 Property ID: ${account.propertyId}`);
            console.log(`🚦 Status: ${account.enabled ? "🟢 Enabled" : "🔴 Disabled"}`);

            try {
                console.log(`📡 Testing Lifetime Users for ${account.name}...`);
                const lifetimeUsers = await getLifetimeActiveUsers(account);
                console.log(`📊 Lifetime Total Users: ${lifetimeUsers}`);

                try {
                    console.log(`📡 Testing Realtime 30-min Users for ${account.name}...`);
                    const min30 = await getActiveUsersLast30Minutes(account);
                    console.log(`📊 Active Users in Last 30 Minutes: ${min30}`);
                } catch (e) {
                    console.log(`⚠️ Realtime 30-min note: ${e.message}`);
                }
                console.log(`🎉 Connection to ${account.name} PASSED!`);
            } catch (err) {
                console.error(`❌ Connection failed for ${account.name}: ${err.message}`);
            }
        }
        return;
    }

    // Fallback: test legacy env credentials
    if (!env.PROPERTY_ID && !env.SERVICE_ACCOUNT_JSON) {
        console.log("ℹ️ No accounts in database and no legacy PROPERTY_ID/SERVICE_ACCOUNT_JSON in environment variables.");
        console.log("💡 You can add Firebase accounts in Telegram using the /admin command!");
        return;
    }

    console.log(`✅ Testing legacy PROPERTY_ID detected: ${env.PROPERTY_ID}`);
    try {
        const lifetimeUsers = await getLifetimeActiveUsers(env);
        console.log(`🎉 Success! Connected to Google Analytics Property ${env.PROPERTY_ID}.`);
        console.log(`📊 Lifetime Total Users: ${lifetimeUsers}`);
    } catch (err) {
        console.error("\n❌ Error connecting to Google Analytics API:", err.message);
    }
}

testGoogleAnalytics();
