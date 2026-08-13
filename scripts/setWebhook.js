import dotenv from 'dotenv';
dotenv.config();

const botToken = process.env.BOT_TOKEN;
const secretToken = process.env.SECRET_TOKEN || process.env.TELEGRAM_SECRET_TOKEN;
const workerUrl = process.argv[2] || process.env.WORKER_URL;

if (!botToken) {
    console.error("❌ Error: BOT_TOKEN environment variable is missing.");
    process.exit(1);
}

if (!workerUrl) {
    console.error("❌ Error: Please provide your Cloudflare Worker URL.");
    console.log("Usage: node scripts/setWebhook.js https://<your-worker-name>.<your-subdomain>.workers.dev");
    process.exit(1);
}

async function setWebhook() {
    const endpoint = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const params = {
        url: workerUrl,
    };

    if (secretToken) {
        params.secret_token = secretToken;
    }

    console.log(`Setting webhook URL to: ${workerUrl}`);
    if (secretToken) {
        console.log(`Configuring secret token...`);
    }

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });

        const data = await res.json();
        if (data.ok) {
            console.log("✅ Webhook set successfully!");
            console.log("Response:", data.description);
        } else {
            console.error("❌ Failed to set webhook:", data.description);
        }
    } catch (err) {
        console.error("❌ Network error while setting webhook:", err);
    }
}

setWebhook();
