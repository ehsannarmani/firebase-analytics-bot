const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { google } = require('google-auth-library');
require('dotenv').config();

// Path to your service account key file
const KEY_FILE_PATH = process.env.SERVICE_ACCOUNT_PATH;
const PROPERTY_ID = process.env.PROPERTY_ID;

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

    // Process and display the results
    console.log('Daily Active Users Report:');
    response.rows.forEach(row => {
        console.log(`Date: ${row.dimensionValues[0].value}, Active Users: ${row.metricValues[0].value}`);
    });
}

// Run the function
getDailyActiveUsers().catch(console.error);