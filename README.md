## Firebase Analytics Telegram Bot (Cloudflare Workers Ready 🚀)

This bot provides real-time and historical Google Analytics reports (daily active users, lifetime users, app version breakdown, new users, and countries) directly in Telegram. It is fully optimized for running on **Cloudflare Workers** with Webhooks and Scheduled Cron Triggers, as well as standalone Node.js long-polling mode.

---

## Features & Architecture

- **Webhooks & Edge Execution**: Powered by `grammY` on Cloudflare Workers with fast global edge delivery.
- **Scheduled Cron Reports**: Automatically sends periodic analytics reports using Cloudflare Workers Cron Triggers:
  - Active users in last 30 minutes (runs every 15 minutes: `*/15 * * * *`).
  - Daily active users report & pinning (runs every 4 hours: `0 */4 * * *`).
- **Web-Native Google Analytics Client**: Built-in OAuth2 JWT & Web Crypto authentication for Google Analytics Data API v1beta REST endpoints without heavyweight Node-only dependencies.
- **Secure Webhook Handler**: Validates Telegram `X-Telegram-Bot-Api-Secret-Token` header.
- **Dual Runtime Support**: Runs on Cloudflare Workers edge environment or locally with Node.js.

---

## Commands

- `/start`: Welcome message and list of available commands.
- `/daily`: Get active users report over the last 7 days with growth indicators.
- `/new_users`: Get new users report over the last 7 days.
- `/versions`: Get active users over the last 7 days grouped by app version.
- `/min30`: Get active users count in the last 30 minutes.
- `/users`: Get total lifetime active users count.
- `/countries`: Get lifetime users by country (optional country filter).
- `/live`: Get live active users count for the last 30 minutes.
- `/stop`: Stop live update notifications.

---

## Configuration & Environment Variables

### 1. Environment Variables / Secrets

Set up the following variables in `.dev.vars` (for local development) or using `wrangler secret put <NAME>` (for Cloudflare deployment):

- `BOT_TOKEN`: Telegram bot token from [@BotFather](https://t.me/BotFather).
- `PROPERTY_ID`: Your Google Analytics 4 Property ID.
- `UPDATE_CHANNEL_ID`: Chat ID for automated periodic updates.
- `AUTHORIZED_CHATS`: Comma-separated Telegram Chat IDs authorized to use the bot.
- `SECRET_TOKEN` (Optional but recommended): Secret string for validating Telegram webhook requests.
- **Google Service Account Credentials** (choose one format):
  - **Format A (Recommended for Cloudflare)**: Set `SERVICE_ACCOUNT_JSON` secret with the full JSON string content of your service account file.
  - **Format B**: Set `SERVICE_ACCOUNT_CLIENT_EMAIL` and `SERVICE_ACCOUNT_PRIVATE_KEY` secrets.
  - **Format C (Local Node.js)**: Set `SERVICE_ACCOUNT_PATH=service-account/service-account.json`.

---

## Setting Production Secrets with Wrangler

### Option A: Interactive Mode (Manual Prompts)

Run each command in your terminal. Wrangler will prompt you to enter/paste the secret value:

```bash
# 1. Telegram Bot Token
npx wrangler secret put BOT_TOKEN

# 2. GA4 Property ID
npx wrangler secret put PROPERTY_ID

# 3. Update Channel ID (for automated reports)
npx wrangler secret put UPDATE_CHANNEL_ID

# 4. Authorized Chat IDs (comma-separated)
npx wrangler secret put AUTHORIZED_CHATS

# 5. Webhook Secret Token (optional but recommended)
npx wrangler secret put SECRET_TOKEN

# 6. Service Account JSON content
npx wrangler secret put SERVICE_ACCOUNT_JSON
```

---

### Option B: Pipe Secrets Directly from Files & Variables

#### **Windows PowerShell**

```powershell
# Pipe your local service-account.json directly into Wrangler secret:
Get-Content -Raw service-account/service-account.json | npx wrangler secret put SERVICE_ACCOUNT_JSON

# Pipe environment variables directly
"1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" | npx wrangler secret put BOT_TOKEN
"123456789" | npx wrangler secret put PROPERTY_ID
"-100123456789" | npx wrangler secret put UPDATE_CHANNEL_ID
"123456789,987654321" | npx wrangler secret put AUTHORIZED_CHATS
"my_super_secret_webhook_token_123" | npx wrangler secret put SECRET_TOKEN
```

#### **Linux / macOS / Bash**

```bash
# Pipe service-account.json file directly into Wrangler secret:
npx wrangler secret put SERVICE_ACCOUNT_JSON < service-account/service-account.json

# Or set secrets via echo:
echo "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" | npx wrangler secret put BOT_TOKEN
echo "123456789" | npx wrangler secret put PROPERTY_ID
echo "-100123456789" | npx wrangler secret put UPDATE_CHANNEL_ID
echo "123456789,987654321" | npx wrangler secret put AUTHORIZED_CHATS
echo "my_super_secret_webhook_token_123" | npx wrangler secret put SECRET_TOKEN
```

---

### Option C: Verify Active Secrets

To list all active secrets configured on your deployed Cloudflare Worker:

```bash
npx wrangler secret list
```

---

## Development & Deployment

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars` and add your credentials:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Start Wrangler local dev server:
   ```bash
   npm run dev
   ```

4. Or start in legacy Node.js long-polling mode:
   ```bash
   npm start
   ```

---

### Cloudflare Workers Deployment

1. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

2. Set your production secrets (using the Wrangler commands detailed above).

3. Register your Telegram Webhook:
   ```bash
   npm run set-webhook -- https://<your-worker-name>.<your-subdomain>.workers.dev
   ```

---

## Verification & Monitoring

- Test health endpoint: `GET https://<your-worker-name>.<your-subdomain>.workers.dev`
- View live logs: `npx wrangler tail`
