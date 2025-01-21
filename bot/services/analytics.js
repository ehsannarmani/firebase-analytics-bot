const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const {formatFirebaseDate} = require("./dateUtils");
require('dotenv').config();

const analyticsDataClient = new BetaAnalyticsDataClient({
    keyFilename: process.env.SERVICE_ACCOUNT_PATH,
});

async function getLifetimeUsersByCountry() {
    const [response] = await analyticsDataClient.runReport({
        property: `properties/${process.env.PROPERTY_ID}`,
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }],
        dimensions: [{ name: 'country' }],
    });

    return response.rows.map(row => ({
        country: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value, 10),
    }));
}

async function getLifetimeActiveUsers() {
    const [response] = await analyticsDataClient.runReport({
        property: `properties/${process.env.PROPERTY_ID}`,
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }],
    });

    if (response.rows && response.rows.length > 0) {
        return parseInt(response.rows[0].metricValues[0].value, 10);
    } else {
        throw new Error('No data found for lifetime active users.');
    }
}

async function getDailyActiveUsers() {
    const [response] = await analyticsDataClient.runReport({
        property: `properties/${process.env.PROPERTY_ID}`,
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }],
        dimensions: [{ name: 'date' }],
    });

    const sortedRows = response.rows.reverse().map(item => ({
        date: item.dimensionValues[0].value,
        users: item.metricValues[0].value
    })).sort((a, b) => a.date - b.date);

    return sortedRows.map((row, index, array) => {
        const date = formatFirebaseDate(row.date);
        const users = parseInt(row.users, 10);
        let growthPercentage = null;
        if (index > 0) {
            const previousDayUsers = parseInt(array[index - 1].users, 10);
            growthPercentage = ((users - previousDayUsers) / previousDayUsers) * 100;
        }
        return {
            date,
            users,
            grow: growthPercentage !== null ? growthPercentage.toFixed(2) : null,
        };
    });
}

async function getActiveUsersLast30Minutes() {
    const [response] = await analyticsDataClient.runRealtimeReport({
        property: `properties/${process.env.PROPERTY_ID}`,
        dateRanges: [{ startDate: '30minutesAgo', endDate: 'now' }],
        metrics: [{ name: 'activeUsers' }],
    });

    if (response.rows && response.rows.length > 0) {
        return parseInt(response.rows[0].metricValues[0].value, 10);
    } else {
        throw new Error('No data found for the last 30 minutes.');
    }
}

module.exports = {
    getLifetimeUsersByCountry,
    getLifetimeActiveUsers,
    getDailyActiveUsers,
    getActiveUsersLast30Minutes,
};
