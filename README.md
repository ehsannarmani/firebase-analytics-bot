# Firebase Analytics Telegram Bot (Cloudflare Workers & Multi-Project Ready 🚀)

A powerful, high-performance Telegram bot that connects to **multiple Firebase / Google Analytics 4 (GA4) properties** simultaneously and generates aggregated and per-project reports directly inside Telegram.

Built with **grammY** and optimized for **Cloudflare Workers** with **Cloudflare D1** persistent storage and Cron Triggers, featuring an interactive **In-Telegram Admin Panel** for zero-code dynamic account management.

---

## 🌟 Key Features

- **🔥 Multi-Firebase Project Support & Filtering**: Manage multiple Firebase/GA4 accounts and filter any command by project name/slug (e.g. `/daily zino`, `/min30 production`).
- **🚨 Proactive Traffic Spike & Drop Alerts**: Automatically detects unusual traffic surges (🟢 `+40%`) or sudden drops (🔴 `-40%`) against rolling 7-day baselines and alerts the Admin and Report Channel with cool-down protection.
- **📊 Period Comparison (`/compare`)**: Compare metrics (Active Users, New Users, Sessions, Engagement) between current period and previous period with dual-period comparison overlay charts.
- **📅 Flexible Date Ranges (`7d`, `14d`, `30d`, `90d`)**: Query custom timeframes on `/daily` and `/new_users` (e.g. `/daily 30d`, `/daily zino 14d`).
- **📈 Interactive "View as Chart" Buttons**: Every analytics report includes an inline `[📈 View as Chart]` button that renders high-definition graphical visual charts directly in Telegram.
- **📱 Project Discoverability & Deep Metadata (`/projects`)**: List all active projects or inspect connected data streams (Android package, iOS bundle, Web) and live statistics snapshots.
- **⚙️ Interactive Telegram Admin Panel (`/admin`)**:
  - Add new Firebase projects via a friendly 3-step wizard (Name ➔ Property ID ➔ Service Account JSON).
  - List all configured accounts with real-time status indicators (🟢 Enabled / 🔴 Disabled).
  - Inspect account details, timestamps, and property IDs.
  - Test live GA4 connectivity (`🧪 Test Connection`) with sanitized feedback.
  - Enable or temporarily disable accounts with 1-click.
  - Delete accounts with a safety confirmation dialog.
  - **👥 Manage Authorized Chats & Access Control**: View, add, and remove authorized Telegram user/group IDs dynamically without redeploying.
  - **📢 Configure Report Channel Dynamically**: Set, update, test (`🧪 Test Channel Message`), or clear the automated report Channel ID directly from Telegram.
- **📊 Unified Multi-Project Reports**:
  - Automatically queries all enabled Firebase accounts in parallel with partial failure tolerance.
- **⏰ Cloudflare Cron Triggers**:
  - **15-minute Active Users & Anomaly Monitor** (`*/15 * * * *`): Sends active users from the last 30 minutes for all enabled projects with interactive chart button and triggers proactive anomaly alerts.
  - **4-hour Daily Analytics Report** (`0 */4 * * *`): Sends 7-day daily active users, day-over-day growth indicators, and lifetime user counts with auto-pinning and chart button.
- **💾 Cloudflare D1 Persistent Storage**: Account configurations, short-lived report contexts, and multi-step conversation states survive Worker deployments and isolate restarts.
- **🔒 Zero-Leak Credential Security & Strict Whitelist**:
  - Service Account credentials are validated live and stored securely in Cloudflare D1.
  - Telegram messages containing sensitive JSON keys are deleted immediately upon processing.
  - Private bot by default: only Main Admin and explicitly authorized chats can query statistics.
- **🔄 1-Click Migration (`/migrate`)**: Effortlessly imports legacy single-project environment variables into the new database.

---

## 🤖 Telegram Commands

### Multi-Project Analytics Commands (Supports Optional `[project]` & `[days]` Filters)
- `/projects [project]` - List all configured Firebase projects or inspect platforms and live metrics.
- `/compare [project] [days]` - Compare metrics against previous period (e.g. `/compare 14d` or `/compare zino 30d`).
- `/daily [project] [days]` - Daily active users report with DoD growth % (e.g. `/daily 30d`, `/daily zino 14d`).
- `/new_users [project] [days]` - Daily new users report with growth % (e.g. `/new_users 30d`).
- `/min30 [project]` - Active users in the last 30 minutes across all projects or for a single project.
- `/users [project]` - Total lifetime active users count.
- `/versions [project]` - Active users over the last 7 days grouped by app version.
- `/countries [project] [codes...]` - Lifetime users grouped by country (e.g. `/countries zino US UK` or `/countries US UK`).
- `/engagement [project]` - Average session duration and engagement rate over the last 7 days.
- `/events [project] [event] [param]` - Event analytics with parameter breakdown.
  - *Drill-down syntax:* `/events [project] event_name param_name` or `/events [project] event_name param1 param2`
- `/live [project]` - Start live active users count in the last 30 minutes.
- `/stop` - Stop live updates by replying `/stop` to a live message.

### Admin & Management Commands (Main Admin Only)
- `/admin` - Open the interactive **Admin Control Panel** with inline buttons.
- `/migrate` - Import legacy `PROPERTY_ID` and `SERVICE_ACCOUNT_JSON` from environment variables into Cloudflare D1.
- `/cancel` - Abort an ongoing multi-step admin input flow.
- `/start` - Welcome message and quick start list.
- `/help` - Detailed command guide.

---

## ⚙️ Configuration & Secrets

With the new architecture, **Firebase accounts, Authorized Chats, and the Report Channel are all managed dynamically from Telegram (`/admin`)**. 

You only need to configure two essential infrastructure secrets:

| Variable | Description | Required |
| :--- | :--- | :--- |
| `BOT_TOKEN` | Telegram bot token from [@BotFather](https://t.me/BotFather) | Yes |
| `MAIN_ADMIN_CHAT_ID` | Telegram User ID of the bot administrator (e.g. `123456789`) | Yes |
| `SECRET_TOKEN` | Webhook secret token for validating incoming Telegram requests | Optional |

---

## 🚀 Deployment Guide (Cloudflare Workers + D1)

### Step 1: Create Cloudflare D1 Database

Run the following command in your terminal to create a D1 database:

```bash
npx wrangler d1 create analytics_bot_db
```

Wrangler will output a configuration snippet. Update `wrangler.jsonc` with your `database_id`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "analytics_bot_db",
    "database_id": "<your-database-id-from-wrangler>"
  }
]
```

### Step 2: Initialize Database Schema

Apply the database schema to your remote D1 database:

```bash
# For production deployment:
npx wrangler d1 execute analytics_bot_db --remote --file=./schema.sql

# For local development:
npx wrangler d1 execute analytics_bot_db --local --file=./schema.sql
```

*(Note: The bot also automatically verifies and initializes tables at runtime if they do not exist!)*

---

### Step 3: Set Production Secrets

Only set your Telegram Bot token and your Admin Chat ID:

```bash
# 1. Telegram Bot Token from @BotFather
npx wrangler secret put BOT_TOKEN

# 2. Main Admin Chat ID (your personal numeric Telegram User ID)
npx wrangler secret put MAIN_ADMIN_CHAT_ID

# 3. (Optional) Webhook Secret Token
npx wrangler secret put SECRET_TOKEN
```

---

### Step 4: Deploy Worker & Register Webhook

1. **Deploy to Cloudflare Workers:**
   ```bash
   npm run deploy
   ```

2. **Register the Telegram Webhook:**
   ```bash
   npm run set-webhook -- https://<your-worker-name>.<your-subdomain>.workers.dev
   ```

---

## 📈 Interactive Graph Charts & Project Filtering

### 1. Project Filtering
All analytics commands support an optional project argument to target a specific Firebase account:

* **All Projects (Default):**
  ```text
  /daily
  /new_users
  /min30
  /users
  ```
  *Queries all enabled Firebase accounts and presents an aggregated summary plus individual breakdowns.*

* **Single Project Filter:**
  ```text
  /daily zino
  /new_users production
  /min30 wordminer
  /countries zino US UK
  /events zino level_complete
  ```
  *Generates statistics exclusively for the specified Firebase account. Matching is case-insensitive.*

* **Discover Project Names:**
  Send `/projects` to list all configured projects and their filter slugs.

### 2. Interactive "📈 View as Chart"
Every analytics report message includes an inline button:
```text
[ 📈 View as Chart ]
```
When clicked, the bot generates a high-definition visual graph chart (with a sleek dark theme) rendered directly from the real statistics in that report and sends it as an image directly into the chat!

---

## 📱 How to Manage Firebase Accounts via Telegram

1. Open your bot in Telegram and send:
   ```text
   /admin
   ```
2. Tap **🔥 Firebase Accounts** ➔ **➕ Add Firebase Account**.
3. **Step 1:** Send a descriptive name (e.g. `My Production App` or `iOS Client`).
4. **Step 2:** Send the numeric GA4 **Property ID** (e.g. `123456789`, found in GA4 *Admin ⚙️ ➔ Property Settings*).
5. **Step 3:** Paste the full Google **Service Account JSON** (or upload the `.json` file).
6. The bot will:
   - Immediately delete the message containing your sensitive JSON to protect credentials.
   - Perform a live authentication and GA4 Data API test query.
   - Save the account into Cloudflare D1 with status 🟢 **Enabled**.

---

## 👥 How to Manage Authorized Chats via Telegram

You can control who can query the bot directly from Telegram without changing environment variables:

1. Send `/admin` to the bot.
2. Tap **`👥 Authorized Chats`**.
3. View current authorization mode (**Open** vs **Restricted**) and all active authorized chat IDs.
4. **To Authorize a User or Group**:
   - Tap **`➕ Add Authorized Chat`**.
   - Send the numeric Telegram User ID or Group/Channel ID with an optional label:
     - *User example:* `123456789 John Doe (Marketing)`
     - *Group example:* `-1001234567890 Dev Team Group`
5. **To Remove an Authorized Chat**:
   - Tap the **`🗑 Remove <Chat>`** button next to any configured chat.
6. **Access Control Hierarchy (Strict Whitelist)**:
   - **Main Admin (`MAIN_ADMIN_CHAT_ID`)**: Always authorized with full administrative privileges.
   - **Database Authorized Chats**: Authorized to query analytics commands.
   - **Legacy `AUTHORIZED_CHATS` Secret**: Backward-compatible fallback.
   - **Default Behavior**: If no additional chats are authorized, the bot is private and exclusively responds to the Main Admin.

---

## 📢 How to Configure the Automated Report Channel via Telegram

You can set, change, test, or clear your Telegram Report Channel ID dynamically at runtime without setting environment secrets or redeploying:

1. Send `/admin` to the bot.
2. Tap **`📢 Report Channel`**.
3. View the currently active channel ID and source (*Database* vs *Environment Variable*).
4. **To Set / Update the Channel**:
   - Tap **`✏️ Set / Change Channel ID`**.
   - Send your channel ID (e.g. ` -1001234567890`).
5. **To Test Channel Permissions**:
   - Tap **`🧪 Test Channel Message`**. The bot will post a verification message into the channel to ensure it has administrator permissions.
6. **To Clear Channel Configuration**:
   - Tap **`🗑 Clear Channel from DB`**.

---

## 🔄 Migrating from Legacy Single-Project Setup

If your bot was previously deployed with `PROPERTY_ID` and `SERVICE_ACCOUNT_JSON` secrets:

1. Deploy the new version and configure `MAIN_ADMIN_CHAT_ID`.
2. Send `/migrate` to your bot (or click **🔄 Legacy Migration** in `/admin`).
3. The bot will automatically validate the existing credentials in your environment variables and import them as a configured project in D1.
4. You can then safely remove `PROPERTY_ID` and `SERVICE_ACCOUNT_JSON` from your Wrangler secrets!

---

## 🧪 Local Development & Testing

1. **Run the Automated Test Suite:**
   ```bash
   npm test
   ```
   *Runs repository CRUD, admin authorization, security validation, and partial failure handling tests.*

2. **Start Wrangler Local Dev Server:**
   ```bash
   cp .dev.vars.example .dev.vars
   # Fill in BOT_TOKEN and MAIN_ADMIN_CHAT_ID in .dev.vars
   npm run dev
   ```

3. **Or Run in Standalone Node.js Mode:**
   ```bash
   npm start
   ```

---

## 🔒 Security Best Practices

1. **Service Account Permissions**: Add your Service Account email as a **Viewer** under Google Analytics (*Admin ⚙️ ➔ Property Access Management*). Never grant Editor or Admin permissions.
2. **Admin Chat ID**: Ensure `MAIN_ADMIN_CHAT_ID` matches your personal Telegram User ID. Non-admin users are strictly blocked from all admin commands and inline callbacks.
3. **Audit & Health Check**: Access `GET https://<your-worker-name>.<your-subdomain>.workers.dev/` to view worker health and connected project counts.
