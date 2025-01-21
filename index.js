const {BetaAnalyticsDataClient} = require('@google-analytics/data');
const {Bot} = require("grammy");
require('dotenv').config();

const KEY_FILE_PATH = process.env.SERVICE_ACCOUNT_PATH;
const PROPERTY_ID = process.env.PROPERTY_ID;

const LAST_30_MIN_INTERVAL = 15 // minutes
const DAILY_ACTIVE_USERS_INTERVAL = 4 * 60 // minutes

const bot = new Bot(process.env.BOT_TOKEN)

const authorizedChats = process.env.AUTHORIZED_CHATS.split(",")

bot.use((ctx, next) => {
    if (!authorizedChats.includes(ctx.chatId.toString())) {
        return ctx.reply("You are not authorized to use this bot ❌")
    }
    return next()
})
bot.command("start", async (ctx) => {
    await ctx.reply("🙌 Welcome to analytics bot\n\n/daily - Get daily active users report\n/min30 - Get last 30 minutes active users\n/users - Get total lifetime users\n/countries - Get total lifetime users by countries")
})
bot.command("daily", async (ctx) => {
    const loadingMessage = await ctx.reply("Getting daily report...")
    const report = (await getDailyActiveUsers()).reverse()
    const msg = report
        .map(dayReport => {
            let result = `📍 <code>${dayReport.date}</code> 👉 <code>${dayReport.users}</code> Active users`
            if (dayReport.grow) {
                if (dayReport.grow < 0) {
                    result += ` 🔴`
                } else {
                    result += ` 🟢`
                }
                result += ` <code>${dayReport.grow}%</code>`
            }
            return result
        })
        .join("\n")
    await ctx.deleteMessages([loadingMessage.message_id])
    await ctx.reply(`👥 Daily active users: \n\n${msg}`, {parse_mode: 'HTML'})
})
bot.command("min30", async (ctx) => {
    const loadingMessage = await ctx.reply("Getting last 30 minutes active report...")
    try {
        const report = await getActiveUsersLast30Minutes()
        await ctx.reply(`📍 Active users in last 30 minutes: <code>${report}</code>`, {parse_mode: 'HTML'})
    } catch (e) {
        console.error('Error fetching last 30 minutes active users:', error);
        await ctx.reply("❌ Failed to fetch last 30 minutes active users. Please try again later.");
    }
    await ctx.deleteMessages([loadingMessage.message_id])
})

bot.command("users", async (ctx) => {
    const loadingMessage = await ctx.reply("Getting total lifetime users...");

    try {
        const lifetimeActiveUsers = await getLifetimeActiveUsers();
        await ctx.reply(`👥 Total Lifetime Users: <code>${lifetimeActiveUsers}</code>`, {
            parse_mode: 'HTML',
        });
    } catch (error) {
        console.error('Error fetching lifetime active users:', error);
        await ctx.reply("❌ Failed to fetch lifetime active users. Please try again later.");
    }
    await ctx.deleteMessages([loadingMessage.message_id]);
});
bot.command("countries", async (ctx) => {
    const loadingMessage = await ctx.reply("Getting total lifetime users by country...");

    try {
        const lifetimeUsersByCountry = await getLifetimeUsersByCountry();
        const formattedMessage = formatLifetimeUsersByCountry(lifetimeUsersByCountry);
        await ctx.reply(`🌍 Total Lifetime Users by Country:\n\n${formattedMessage}`, {
            parse_mode: 'HTML',
        });
    } catch (error) {
        console.error('Error fetching lifetime users by country:', error);
        await ctx.reply("❌ Failed to fetch lifetime users by country. Please try again later.");
    }
    await ctx.deleteMessages([loadingMessage.message_id]);
});
bot.start()
console.log("Bot is running...")

setInterval(async function () {
    try {
        const report = await getActiveUsersLast30Minutes()
        await bot.api.sendMessage(process.env.UPDATE_CHANNEL_ID, `📍 Active users in last 30 minutes: <code>${report}</code>\n\n⏳ ${getFormattedDate()}`, {parse_mode: 'HTML'})
    } catch (e) {
        console.log(e)
    }
}, LAST_30_MIN_INTERVAL * 60 * 1000)
setInterval(async function () {
    try {
        const totalUsers = await getLifetimeActiveUsers()
        const report = (await getDailyActiveUsers()).reverse()
        const today = report[0]
        let splitDate = today.date.split("-")
        const day = splitDate[2]
        const month = splitDate[1]
        const monthName = getMonthName(month)
        let msg = `📍 Today(${day} ${monthName}) active users: <code>${today.users}</code>`
        if (today.grow) {
            if (today.grow < 0) {
                msg += `\n😓 Unfortunately, we fell <code>${today.grow}%</code> from the previous day.`
            } else {
                msg += `\n🎉 Congratulations! we grew <code>${today.grow}%</code> from yesterday.`
            }
        }
        msg += `\n\n🙌 We reached to total: <code>${totalUsers}</code> users.`
        const message = await bot.api.sendMessage(process.env.UPDATE_CHANNEL_ID, `${msg}\n\n⏳ ${getFormattedDate()}`, {parse_mode: 'HTML'})
        try {
            await bot.api.pinChatMessage(process.env.UPDATE_CHANNEL_ID, message.message_id)
        } catch (e) {
            await bot.api.unpinAllChatMessages(process.env.UPDATE_CHANNEL_ID)
            await bot.api.pinChatMessage(process.env.UPDATE_CHANNEL_ID, message.message_id)
        }
    } catch (e) {
        console.log(e)
    }
}, DAILY_ACTIVE_USERS_INTERVAL * 60 * 1000)


async function getLifetimeUsersByCountry() {
    // Initialize the Analytics Data client
    const analyticsDataClient = new BetaAnalyticsDataClient({
        keyFilename: KEY_FILE_PATH,
    });

    // Define the metrics to retrieve (total lifetime users)
    const metrics = [
        {
            name: 'totalUsers',
        },
    ];

    // Define the dimensions to group by (country)
    const dimensions = [
        {
            name: 'country',
        },
    ];

    // Make the API request
    const [response] = await analyticsDataClient.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{startDate: '2020-01-01', endDate: 'today'}], // Use a wide date range
        metrics: metrics,
        dimensions: dimensions,
    });

    // Extract the total lifetime users by country
    return response.rows.map(row => ({
        country: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value, 10),
    }));
}

async function getLifetimeActiveUsers() {
    // Initialize the Analytics Data client
    const analyticsDataClient = new BetaAnalyticsDataClient({
        keyFilename: KEY_FILE_PATH,
    });

    // Define the metrics to retrieve (total lifetime users)
    const metrics = [
        {
            name: 'totalUsers',
        },
    ];

    // Make the API request
    const [response] = await analyticsDataClient.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [{startDate: '2020-01-01', endDate: 'today'}], // Use a wide date range
        metrics: metrics,
    });

    // Extract the total lifetime active users count
    if (response.rows && response.rows.length > 0) {
        return parseInt(response.rows[0].metricValues[0].value, 10);
    } else {
        throw new Error('No data found for lifetime active users.');
    }
}

async function getDailyActiveUsers() {
    // Initialize the Analytics Data client
    const analyticsDataClient = new BetaAnalyticsDataClient({
        keyFilename: KEY_FILE_PATH,
    });

    // Define the date range for the report
    const dateRange = {
        startDate: '7daysAgo', // Last 7 days
        endDate: 'today',
    };

    // Define the metrics to retrieve (daily active users)
    const metrics = [
        {
            name: 'activeUsers',
        },
    ];

    // Define the dimensions to group by (date)
    const dimensions = [
        {
            name: 'date',
        },
    ];

    // Make the API request
    const [response] = await analyticsDataClient.runReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        metrics: metrics,
        dimensions: dimensions,
    });
    let sortedRows = response.rows.reverse().map(item => {
        return {
            date: item.dimensionValues[0].value,
            users: item.metricValues[0].value
        }
    })
    sortedRows = sortedRows.sort((a, b) => a.date - b.date)
    const result = sortedRows.map((row, index, array) => {
        const date = formatFirebaseDate(row.date); // Format date
        const users = parseInt(row.users, 10); // Convert users to number

        // Calculate growth percentage
        let growthPercentage = null;
        if (index > 0) {
            const previousDayUsers = parseInt(array[index - 1].users, 10);
            growthPercentage = ((users - previousDayUsers) / previousDayUsers) * 100;
        }

        return {
            date: date,
            users: users,
            grow: growthPercentage !== null ? growthPercentage.toFixed(2) : null, // Round to 2 decimal places
        };
    });

    console.log(result)
    return result
}

async function getActiveUsersLast30Minutes() {
    // Initialize the Analytics Data client
    const analyticsDataClient = new BetaAnalyticsDataClient({
        keyFilename: KEY_FILE_PATH,
    });

    // Define the date range for the last 30 minutes
    const dateRange = {
        startDate: '30minutesAgo', // Last 30 minutes
        endDate: 'now', // Current time
    };

    // Define the metrics to retrieve (active users)
    const metrics = [
        {
            name: 'activeUsers',
        },
    ];

    // Make the API request
    const [response] = await analyticsDataClient.runRealtimeReport({
        property: `properties/${PROPERTY_ID}`,
        dateRanges: [dateRange],
        metrics: metrics,
    });

    // Extract the active users count
    if (response.rows && response.rows.length > 0) {
        return parseInt(response.rows[0].metricValues[0].value, 10);
    } else {
        throw new Error('No data found for the last 30 minutes.');
    }
}


function formatFirebaseDate(yyyymmdd) {
    const year = yyyymmdd.slice(0, 4);
    const month = yyyymmdd.slice(4, 6);
    const day = yyyymmdd.slice(6, 8);
    return `${year}-${month}-${day}`;
}

function getFormattedDate() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function formatLifetimeUsersByCountry(data) {
    return data
        .map(item => `📍 <code>${item.country.replace("(not set)", "Unknown")}</code>: <code>${item.users}</code> users`)
        .join('\n');
}

function getMonthName(month) {
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    return monthNames[month - 1];
}


