import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { getLifetimeActiveUsers, getActiveUsersLast30Minutes } from '../bot/services/analytics.js';

// Load .env and .dev.vars for local testing environment
dotenv.config({ path: '.env' });
if (existsSync('.dev.vars')) {
    const devVars = dotenv.parse(readFileSync('.dev.vars'));
    Object.assign(process.env, devVars);
}

async function testGoogleAnalytics() {
    console.log("🔍 Testing Google Analytics Service Account Configuration...\n");

    const env = process.env;

    // 1. Check PROPERTY_ID
    if (!env.PROPERTY_ID) {
        console.error("❌ Failed: PROPERTY_ID is missing in environment variables (.env / .dev.vars).");
        process.exit(1);
    }
    console.log(`✅ PROPERTY_ID detected: ${env.PROPERTY_ID}`);

    // 2. Check Service Account source
    if (env.SERVICE_ACCOUNT_JSON) {
        console.log("✅ SERVICE_ACCOUNT_JSON detected in environment.");
    } else if (env.SERVICE_ACCOUNT_CLIENT_EMAIL && env.SERVICE_ACCOUNT_PRIVATE_KEY) {
        console.log("✅ SERVICE_ACCOUNT_CLIENT_EMAIL & SERVICE_ACCOUNT_PRIVATE_KEY detected in environment.");
    } else if (env.SERVICE_ACCOUNT_PATH) {
        console.log(`✅ SERVICE_ACCOUNT_PATH detected: ${env.SERVICE_ACCOUNT_PATH}`);
    } else {
        console.error("❌ Failed: No Service Account credentials found. Set SERVICE_ACCOUNT_JSON, SERVICE_ACCOUNT_CLIENT_EMAIL/PRIVATE_KEY, or SERVICE_ACCOUNT_PATH.");
        process.exit(1);
    }

    // 3. Test API Call: Lifetime Users
    try {
        console.log("\n📡 Sending test request to Google Analytics Data API (Lifetime Users)...");
        const lifetimeUsers = await getLifetimeActiveUsers(env);
        console.log(`🎉 Success! Connected to Google Analytics Property ${env.PROPERTY_ID}.`);
        console.log(`📊 Lifetime Total Users: ${lifetimeUsers}`);
    } catch (err) {
        console.error("\n❌ Error connecting to Google Analytics API:");
        console.error(err.message);
        console.log("\n💡 Troubleshooting Tips:");
        console.log("  1. Ensure 'Google Analytics Data API' is ENABLED in Google Cloud Console.");
        console.log("  2. Ensure your Service Account email is added as a 'Viewer' in Google Analytics (Admin -> Property Access Management).");
        console.log("  3. Verify PROPERTY_ID is correct (numeric ID, e.g. 123456789).");
        process.exit(1);
    }

    // 4. Test API Call: Realtime 30-min Users
    try {
        console.log("\n📡 Sending test request to Google Analytics Realtime API (Last 30 Min)...");
        const min30Users = await getActiveUsersLast30Minutes(env);
        console.log(`📊 Active Users in Last 30 Minutes: ${min30Users}`);
        console.log("\n✨ All tests PASSED! Your Google Analytics Service Account is configured correctly.");
    } catch (err) {
        console.error("⚠️ Realtime report note:", err.message);
        console.log("✨ Lifetime user report passed! Authentication and basic access are working.");
    }
}

testGoogleAnalytics();
