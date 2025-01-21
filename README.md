## Firebase Analytics Telegram Bot
This bot provides real-time and historical analytics reports, including daily active users, lifetime users, and user growth, directly in Telegram.

---

## Setup
### 1. Configure `.env`

   Create a `.env` file and add the following variables:
 - `PROPERTY_ID`: Available in your Firebase console.
 - `SERVICE_ACCOUNT_PATH`: Path to your Google Analytics service account JSON file.
 - `BOT_TOKEN`: Telegram bot token for integration.
 - `UPDATE_CHANNEL_ID`: Chat ID of the channel or group where the bot will send updates (e.g., last 30 minutes active users every 15 minutes and daily active users every 4 hours).
 - `AUTHORIZED_CHATS`: List of chat IDs authorized to use bot commands (separated by commas).

### 2. Run the Bot

Install dependencies and start the bot:

```bash
npm install
npm start
```

## Commands

- `/daily`: Get a report of active users over the last 7 days.
- `/min30`: Get a report of active users in the last 30 minutes.
- `/users`: Get the total lifetime users count.
- `/countries`: Get the total lifetime users by country.
- `/live`: Start a live update of active users in the last 30 minutes (updates every 5 seconds).
- `/stop`: Stop the live update by replying to the live update message.

## Schedules
The bot automatically sends updates to the UPDATE_CHANNEL_ID at regular intervals:
- `Daily Active Users`: Sends the previous day's active user count every 4 hours.
- `Last 30 Minutes Active Users`: Sends the active user count for the last 30 minutes every 15 minutes.

You can adjust the intervals in `bot/services/scheduler.js`

## Contributing
Contributions are welcome! If you have any suggestions, bug reports, or feature requests, please open an issue or submit a pull request.

