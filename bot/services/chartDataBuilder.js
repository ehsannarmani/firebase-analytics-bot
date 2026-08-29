/**
 * Builds Chart.js visual configuration objects for various report types.
 * Styled with a modern dark theme optimized for Telegram dark mode.
 */

const PALETTE = [
    '#6366f1', // Indigo
    '#ec4899', // Pink
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#3b82f6', // Blue
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#f43f5e', // Rose
    '#14b8a6', // Teal
    '#eab308', // Yellow
];

/**
 * Builds a chart specification for a report.
 * 
 * @param {string} reportType - e.g. 'daily', 'new_users', 'min30', 'users', 'versions', 'countries', 'engagement', 'events'
 * @param {Array} results - array of { account, success, data }
 * @param {object} metadata - extra metadata
 * @returns {object|null} Chart.js configuration
 */
export function buildChartConfig(reportType, results, metadata = {}) {
    if (!results || results.length === 0) {
        return null;
    }

    const successfulResults = results.filter(r => r.success && r.data);
    if (successfulResults.length === 0) {
        return null;
    }

    switch (reportType) {
        case 'daily':
            return buildDailyActiveUsersChart(successfulResults, metadata, 'Daily Active Users (Last 7 Days)', 'Active Users');
        case 'new_users':
            return buildDailyActiveUsersChart(successfulResults, metadata, 'Daily New Users (Last 7 Days)', 'New Users');
        case 'min30':
            return buildMin30Chart(successfulResults, metadata);
        case 'users':
            return buildLifetimeUsersChart(successfulResults, metadata);
        case 'versions':
            return buildVersionsChart(successfulResults, metadata);
        case 'countries':
            return buildCountriesChart(successfulResults, metadata);
        case 'engagement':
            return buildEngagementChart(successfulResults, metadata);
        case 'events':
            return buildEventsChart(successfulResults, metadata);
        case 'compare':
            return buildComparisonChart(successfulResults, metadata);
        case 'dashboard':
            return buildDashboardChart(successfulResults, metadata);
        default:
            return null;
    }
}

/**
 * Common Dark Theme Base Options
 */
function getDarkThemeBase(titleText) {
    return {
        responsive: true,
        plugins: {
            title: {
                display: Boolean(titleText),
                text: titleText,
                color: '#f4f4f5',
                font: { size: 18, weight: 'bold', family: 'sans-serif' },
                padding: { top: 12, bottom: 20 },
            },
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#e4e4e7',
                    font: { size: 13, weight: '600' },
                    boxWidth: 14,
                    boxHeight: 14,
                    padding: 15,
                }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.08)', drawBorder: false },
                ticks: { color: '#a1a1aa', font: { size: 12 } },
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.08)', drawBorder: false },
                ticks: { color: '#a1a1aa', font: { size: 12 } },
                beginAtZero: true,
            }
        }
    };
}

/**
 * 1. Line Chart for Daily / New Users (Single or Multi-project)
 */
function buildDailyActiveUsersChart(results, metadata, title, metricLabel) {
    // Extract unique sorted date labels from the first successful result
    // Note: getDailyActiveUsers returns sorted ascending: [{ date, users }, ...]
    const firstData = results[0].data;
    const labels = firstData.map(d => d.date);

    const datasets = results.map((res, idx) => {
        const color = PALETTE[idx % PALETTE.length];
        const dataValues = res.data.map(d => Number(d.users) || 0);

        return {
            label: res.account.name,
            data: dataValues,
            borderColor: color,
            backgroundColor: results.length === 1 ? hexToRgba(color, 0.25) : color,
            fill: results.length === 1,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1.5,
        };
    });

    const isSingle = results.length === 1;
    const chartTitle = isSingle ? `📊 ${results[0].account.name} — ${title}` : `📊 ${title}`;

    const options = getDarkThemeBase(chartTitle);
    if (isSingle) {
        options.plugins.legend.display = false;
    }

    return {
        type: 'line',
        data: { labels, datasets },
        options,
    };
}

/**
 * 2. Bar Chart for Last 30 Minutes Active Users
 */
function buildMin30Chart(results, metadata) {
    const isSingle = results.length === 1;
    const labels = results.map(r => r.account.name);
    const dataValues = results.map(r => Number(r.data) || 0);
    const backgroundColors = results.map((_, i) => PALETTE[i % PALETTE.length]);

    const title = isSingle
        ? `📍 ${results[0].account.name} — Active Users (Last 30 Min)`
        : `📍 Active Users in Last 30 Minutes (All Projects)`;

    const options = getDarkThemeBase(title);
    options.plugins.legend.display = false;

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Active Users',
                data: dataValues,
                backgroundColor: backgroundColors,
                borderRadius: 8,
                borderWidth: 0,
            }]
        },
        options,
    };
}

/**
 * 3. Lifetime Users Comparison Chart
 */
function buildLifetimeUsersChart(results, metadata) {
    const isSingle = results.length === 1;
    const labels = results.map(r => r.account.name);
    const dataValues = results.map(r => Number(r.data) || 0);
    const colors = results.map((_, i) => PALETTE[i % PALETTE.length]);

    const title = isSingle
        ? `👥 ${results[0].account.name} — Total Lifetime Active Users`
        : `👥 Total Lifetime Active Users by Project`;

    if (!isSingle && results.length <= 6) {
        // Doughnut chart for clean multi-project proportion comparison
        return {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#18181b',
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        color: '#f4f4f5',
                        font: { size: 18, weight: 'bold' },
                        padding: { top: 10, bottom: 20 },
                    },
                    legend: {
                        position: 'right',
                        labels: { color: '#e4e4e7', font: { size: 13 } }
                    }
                }
            }
        };
    }

    // Bar chart fallback
    const options = getDarkThemeBase(title);
    options.plugins.legend.display = false;

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Lifetime Users',
                data: dataValues,
                backgroundColor: colors,
                borderRadius: 8,
            }]
        },
        options,
    };
}

/**
 * 4. Versions Breakdown Horizontal Bar Chart
 */
function buildVersionsChart(results, metadata) {
    // If single project or first project with version data
    const first = results[0];
    const versions = (first.data || []).slice(0, 10);
    const labels = versions.map(v => v.version || 'Unknown');
    const dataValues = versions.map(v => Number(v.users) || 0);

    const title = results.length === 1
        ? `📱 ${first.account.name} — Users by App Version`
        : `📱 ${first.account.name} — Users by App Version (Top Project)`;

    const options = getDarkThemeBase(title);
    options.indexAxis = 'y'; // Horizontal bar chart
    options.plugins.legend.display = false;

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Active Users',
                data: dataValues,
                backgroundColor: '#3b82f6',
                borderRadius: 6,
            }]
        },
        options,
    };
}

/**
 * 5. Countries Breakdown Horizontal Bar Chart
 */
function buildCountriesChart(results, metadata) {
    const first = results[0];
    const countries = (first.data || []).slice(0, 10);
    const labels = countries.map(c => c.country || 'Unknown');
    const dataValues = countries.map(c => Number(c.users) || 0);

    const title = results.length === 1
        ? `🌍 ${first.account.name} — Top Countries by Lifetime Users`
        : `🌍 ${first.account.name} — Top Countries by Lifetime Users`;

    const options = getDarkThemeBase(title);
    options.indexAxis = 'y';
    options.plugins.legend.display = false;

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Users',
                data: dataValues,
                backgroundColor: '#10b981',
                borderRadius: 6,
            }]
        },
        options,
    };
}

/**
 * 6. Engagement Metrics Trend Line Chart
 */
function buildEngagementChart(results, metadata) {
    const first = results[0];
    const data = first.data || [];
    const labels = data.map(d => d.date);

    // Duration in minutes
    const durationsMins = data.map(d => (d.avgSessionDuration / 60).toFixed(1));
    const engagementRates = data.map(d => (d.engagementRate * 100).toFixed(1));

    const title = `⏱ ${first.account.name} — Engagement Duration & Rate (Last 7 Days)`;

    const options = getDarkThemeBase(title);
    options.scales.y = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Avg Duration (Minutes)', color: '#6366f1' },
        grid: { color: 'rgba(255, 255, 255, 0.08)' },
        ticks: { color: '#a1a1aa' },
    };
    options.scales.y1 = {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Engagement Rate (%)', color: '#10b981' },
        grid: { drawOnChartArea: false },
        ticks: { color: '#a1a1aa' },
        min: 0,
        max: 100,
    };

    return {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Avg Duration (min)',
                    data: durationsMins,
                    borderColor: '#6366f1',
                    backgroundColor: '#6366f1',
                    yAxisID: 'y',
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 4,
                },
                {
                    label: 'Engagement Rate (%)',
                    data: engagementRates,
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    yAxisID: 'y1',
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 4,
                }
            ]
        },
        options,
    };
}

/**
 * 7. Events Breakdown Horizontal Bar Chart
 */
function buildEventsChart(results, metadata) {
    const first = results[0];
    const events = (first.data || []).slice(0, 10);
    const labels = events.map(e => e.eventName || 'Unknown');
    const counts = events.map(e => Number(e.count) || 0);

    const title = `⚡️ ${first.account.name} — Top Events (Last 7 Days)`;

    const options = getDarkThemeBase(title);
    options.indexAxis = 'y';
    options.plugins.legend.display = false;

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Event Count',
                data: counts,
                backgroundColor: '#ec4899',
                borderRadius: 6,
            }]
        },
        options,
    };
}

/**
 * 8. Comparison Line Chart with Dual-Period Overlay
 */
function buildComparisonChart(results, metadata) {
    const first = results[0];
    const compData = first.data?.chartData;
    if (!compData) return null;

    const currentDaily = compData.currentDaily || [];
    const prevDaily = compData.prevDaily || [];

    const count = Math.max(currentDaily.length, prevDaily.length);
    const labels = Array.from({ length: count }, (_, i) => `Day ${i + 1}`);

    const currentValues = currentDaily.map(d => Number(d.users) || 0);
    const prevValues = prevDaily.map(d => Number(d.users) || 0);

    const title = `📈 ${first.account.name} — Period Comparison (${first.data.periodDays || 7} Days)`;

    const options = getDarkThemeBase(title);

    return {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Current Period (${first.data.periodDays || 7}d)`,
                    data: currentValues,
                    borderColor: '#6366f1',
                    backgroundColor: hexToRgba('#6366f1', 0.2),
                    fill: true,
                    tension: 0.35,
                    borderWidth: 3,
                    pointRadius: 4,
                },
                {
                    label: `Previous Period (${first.data.periodDays || 7}d)`,
                    data: prevValues,
                    borderColor: '#a1a1aa',
                    borderDash: [6, 6],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.35,
                    borderWidth: 2.5,
                    pointRadius: 3,
                }
            ]
        },
        options,
    };
}

/**
 * 9. Executive Multi-Project Overview Dashboard Chart
 */
function buildDashboardChart(results, metadata) {
    const labels = results.map(r => r.account.name);
    const todayUsers = results.map(r => Number(r.data?.todayActive) || 0);
    const newUsers = results.map(r => Number(r.data?.todayNewUsers) || 0);
    const active30m = results.map(r => Number(r.data?.active30m) || 0);

    const title = `🎛 Multi-Project Performance Overview`;
    const options = getDarkThemeBase(title);

    return {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Today Active Users',
                    data: todayUsers,
                    backgroundColor: '#6366f1',
                    borderRadius: 6,
                },
                {
                    label: 'Today New Users',
                    data: newUsers,
                    backgroundColor: '#10b981',
                    borderRadius: 6,
                },
                {
                    label: 'Realtime (Last 30m)',
                    data: active30m,
                    backgroundColor: '#ec4899',
                    borderRadius: 6,
                }
            ]
        },
        options,
    };
}

function hexToRgba(hex, alpha) {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
