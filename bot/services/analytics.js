import { formatFirebaseDate } from "./dateUtils.js";
import { FirebaseAccountRepository } from "../db/accountRepository.js";

// Token cache keyed by clientEmail to support multiple accounts
const tokenCache = new Map();

function pemToBinary(pem) {
    const lines = pem.split('\n');
    const encoded = lines
        .filter(line => !line.startsWith('-----'))
        .join('');
    const binaryString = atob(encoded.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function base64url(source) {
    let encoded;
    if (typeof source === 'string') {
        encoded = btoa(unescape(encodeURIComponent(source)));
    } else {
        let binary = '';
        const bytes = new Uint8Array(source);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        encoded = btoa(binary);
    }
    return encoded
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

/**
 * Extracts and normalizes credentials from an account object, a raw JSON string, or legacy env.
 */
export async function getCredentials(target = {}) {
    // 0. Direct normalized credentials object
    if (target?.clientEmail && target?.privateKey) {
        return {
            clientEmail: target.clientEmail,
            privateKey: target.privateKey.replace(/\\n/g, '\n'),
            propertyId: target.propertyId,
            name: target.name || "Default",
            id: target.id || null,
        };
    }

    if (target?.client_email && target?.private_key) {
        return {
            clientEmail: target.client_email,
            privateKey: target.private_key.replace(/\\n/g, '\n'),
            propertyId: target.propertyId || target.property_id,
            name: target.name || "Default",
            id: target.id || null,
        };
    }

    // 1. Direct account object from DB
    if (target?.serviceAccountJson || (target?.propertyId && target?.serviceAccountJson)) {
        try {
            const parsed = typeof target.serviceAccountJson === 'object'
                ? target.serviceAccountJson
                : JSON.parse(target.serviceAccountJson);
            return {
                clientEmail: parsed.client_email,
                privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
                propertyId: target.propertyId || parsed.property_id,
                name: target.name || "Default",
                id: target.id || null,
            };
        } catch (e) {
            throw new Error("Invalid service account JSON structure in account configuration.");
        }
    }

    // 2. Direct JSON string passed as parameter
    if (typeof target === 'string') {
        try {
            const parsed = JSON.parse(target);
            return {
                clientEmail: parsed.client_email,
                privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
                propertyId: parsed.property_id || null,
            };
        } catch (e) {
            throw new Error("Invalid service account JSON string.");
        }
    }

    // 3. Legacy env fallback
    const env = target || {};
    const jsonVal = env?.SERVICE_ACCOUNT_JSON || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_JSON : undefined);
    if (jsonVal) {
        try {
            const parsed = typeof jsonVal === 'object' ? jsonVal : JSON.parse(jsonVal);
            const propertyId = env?.PROPERTY_ID || (typeof process !== 'undefined' ? process.env?.PROPERTY_ID : undefined) || parsed.property_id;
            return {
                clientEmail: parsed.client_email,
                privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
                propertyId,
                name: "Default App",
            };
        } catch (e) {
            // Handled below
        }
    }

    const clientEmail = env?.SERVICE_ACCOUNT_CLIENT_EMAIL || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_CLIENT_EMAIL : undefined);
    const privateKey = env?.SERVICE_ACCOUNT_PRIVATE_KEY || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_PRIVATE_KEY : undefined);
    const propertyId = env?.PROPERTY_ID || (typeof process !== 'undefined' ? process.env?.PROPERTY_ID : undefined);

    if (clientEmail && privateKey) {
        return {
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
            propertyId,
            name: "Default App",
        };
    }

    const pathVal = env?.SERVICE_ACCOUNT_PATH || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_PATH : undefined);
    if (pathVal) {
        try {
            const fs = await import('node:fs');
            const content = fs.readFileSync(pathVal, 'utf8');
            const parsed = JSON.parse(content);
            return {
                clientEmail: parsed.client_email,
                privateKey: parsed.private_key?.replace(/\\n/g, '\n'),
                propertyId: propertyId || parsed.property_id,
                name: "Default App",
            };
        } catch (e) {
            // Handled below
        }
    }

    throw new Error("Google Service Account credentials not found. Please add a Firebase account in /admin or configure credentials.");
}

/**
 * Obtains and caches OAuth2 access tokens for a given service account.
 */
export async function getAccessToken(credentials) {
    if (!credentials?.clientEmail || !credentials?.privateKey) {
        throw new Error("Missing client_email or private_key in credentials.");
    }

    const now = Math.floor(Date.now() / 1000);
    const cached = tokenCache.get(credentials.clientEmail);
    if (cached && cached.expiresAt > now + 60) {
        return cached.token;
    }

    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: credentials.clientEmail,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const toSign = `${encodedHeader}.${encodedPayload}`;

    let binaryKey;
    try {
        binaryKey = pemToBinary(credentials.privateKey);
    } catch (e) {
        throw new Error("Invalid RSA Private Key format. Ensure the private key PEM is well-formed.");
    }

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(toSign)
    );

    const encodedSignature = base64url(signatureBuffer);
    const jwt = `${toSign}.${encodedSignature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        if (res.status === 400 || res.status === 401) {
            throw new Error("Google OAuth authentication rejected: Invalid service account credentials or key.");
        }
        throw new Error(`Google OAuth token request failed with status ${res.status}.`);
    }

    const tokenData = await res.json();
    tokenCache.set(credentials.clientEmail, {
        token: tokenData.access_token,
        expiresAt: now + (tokenData.expires_in || 3600),
    });

    return tokenData.access_token;
}

/**
 * Executes a request against the Google Analytics Data API with sanitized errors.
 */
async function runReportApi(endpoint, body, target) {
    const creds = await getCredentials(target);
    if (!creds.propertyId) {
        throw new Error("Property ID is missing for this account.");
    }

    const accessToken = await getAccessToken(creds);
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${creds.propertyId}:${endpoint}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        if (res.status === 403) {
            throw new Error(`Permission denied: Ensure ${creds.clientEmail} is added as a 'Viewer' in Google Analytics (Admin ⚙️ ➔ Property Access Management).`);
        }
        if (res.status === 404) {
            throw new Error(`Property ${creds.propertyId} not found. Please verify the Property ID.`);
        }
        if (res.status === 400) {
            throw new Error(`Google Analytics API error (400): Invalid request or property configuration.`);
        }
        throw new Error(`Google Analytics API request failed with status ${res.status}.`);
    }

    return await res.json();
}

/**
 * Validates a Service Account JSON and verifies live connection to a GA4 Property.
 */
export async function validateAccountCredentials(serviceAccountJson, propertyId) {
    try {
        if (!serviceAccountJson || typeof serviceAccountJson !== 'string') {
            return { ok: false, error: "Service Account JSON must be a non-empty string." };
        }

        if (!propertyId || !/^\d+$/.test(propertyId.toString().trim())) {
            return { ok: false, error: "Property ID must be numeric (e.g. 123456789)." };
        }

        let parsed;
        try {
            parsed = JSON.parse(serviceAccountJson);
        } catch (e) {
            return { ok: false, error: "Invalid JSON format. Please send a valid Google Service Account JSON." };
        }

        if (!parsed.client_email) {
            return { ok: false, error: "Missing 'client_email' in Service Account JSON." };
        }

        if (!parsed.private_key) {
            return { ok: false, error: "Missing 'private_key' in Service Account JSON." };
        }

        if (!parsed.private_key.includes("-----BEGIN PRIVATE KEY-----")) {
            return { ok: false, error: "Invalid 'private_key' format. It must be an RSA private key PEM." };
        }

        const credentials = {
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key.replace(/\\n/g, '\n'),
            propertyId: propertyId.toString().trim(),
        };

        // Test OAuth Access Token generation
        await getAccessToken(credentials);

        // Test Live API Call to Google Analytics Data API
        await runReportApi('runReport', {
            dateRanges: [{ startDate: 'today', endDate: 'today' }],
            metrics: [{ name: 'activeUsers' }],
        }, credentials);

        return {
            ok: true,
            clientEmail: parsed.client_email,
            propertyId: propertyId.toString().trim(),
        };
    } catch (err) {
        return {
            ok: false,
            error: err.message || "Failed to validate credentials.",
        };
    }
}

/**
 * Retrieves enabled accounts from database, or fallback legacy account if DB has none.
 */
export async function getAccountsForExecution(env = {}) {
    try {
        const repo = new FirebaseAccountRepository(env);
        const accounts = await repo.getEnabled();
        if (accounts && accounts.length > 0) {
            return accounts;
        }
    } catch (e) {
        console.warn("Could not query account repository:", e.message);
    }

    // Check if legacy credentials exist in env
    try {
        const legacyCreds = await getCredentials(env);
        if (legacyCreds && legacyCreds.propertyId) {
            return [{
                id: 'legacy_default',
                name: legacyCreds.name || 'Default App',
                propertyId: legacyCreds.propertyId,
                serviceAccountJson: env?.SERVICE_ACCOUNT_JSON || JSON.stringify({
                    client_email: legacyCreds.clientEmail,
                    private_key: legacyCreds.privateKey,
                }),
                enabled: true,
            }];
        }
    } catch (e) {
        // No accounts available
    }

    return [];
}

/**
 * Runs queries across multiple accounts with Promise.allSettled to handle partial failures gracefully.
 */
export async function runMultiAccountExecution(accounts, executeFn) {
    if (!accounts || accounts.length === 0) {
        return [];
    }

    const promises = accounts.map(async (account) => {
        try {
            const data = await executeFn(account);
            return {
                account,
                success: true,
                data,
                error: null,
            };
        } catch (error) {
            return {
                account,
                success: false,
                data: null,
                error: error.message || "Failed to retrieve statistics",
            };
        }
    });

    return await Promise.all(promises);
}

// -------------------------------------------------------------
// Core Analytics API Methods
// -------------------------------------------------------------

export async function getLifetimeUsersByCountry(target) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }],
        dimensions: [{ name: 'country' }],
    }, target);

    if (!data.rows) return [];
    return data.rows.map(row => ({
        country: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value, 10),
    }));
}

export async function getLifetimeActiveUsers(target) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }],
    }, target);

    if (data.rows && data.rows.length > 0) {
        return parseInt(data.rows[0].metricValues[0].value, 10);
    } else {
        return 0;
    }
}

export async function getDailyActiveUsersPerAppVersion(metricName = 'activeUsers', dimensionName = 'appVersion', target) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: metricName }],
        dimensions: [{ name: dimensionName }],
    }, target);

    if (!data.rows) return [];
    return data.rows.map(item => ({
        version: item.dimensionValues[0].value,
        users: parseInt(item.metricValues[0].value, 10),
    }));
}

export async function getDailyActiveUsers(metrics = 'activeUsers', target, days = 7) {
    let targetParam = target;
    let metricName = metrics;

    if (typeof metrics === 'object' && !target) {
        targetParam = metrics;
        metricName = 'activeUsers';
    }

    const daysCount = parseInt(days, 10) || 7;
    const startDate = `${daysCount}daysAgo`;

    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate, endDate: 'today' }],
        metrics: [{ name: metricName }],
        dimensions: [{ name: 'date' }],
    }, targetParam);

    if (!data.rows) return [];

    const sortedRows = data.rows.reverse().map(item => ({
        date: item.dimensionValues[0].value,
        users: item.metricValues[0].value
    })).sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10));

    return sortedRows.map((row, index, array) => {
        const date = formatFirebaseDate(row.date);
        const users = parseInt(row.users, 10);
        let growthPercentage = null;
        if (index > 0) {
            const previousDayUsers = parseInt(array[index - 1].users, 10);
            if (previousDayUsers > 0) {
                growthPercentage = ((users - previousDayUsers) / previousDayUsers) * 100;
            }
        }
        return {
            date,
            users,
            grow: growthPercentage !== null ? growthPercentage.toFixed(2) : null,
        };
    });
}

/**
 * Compares analytics metrics between current period and previous period.
 */
export async function getPeriodComparison(target, days = 7) {
    const periodDays = parseInt(days, 10) || 7;
    const currentStart = `${periodDays}daysAgo`;
    const prevStart = `${periodDays * 2}daysAgo`;
    const prevEnd = `${periodDays + 1}daysAgo`;

    const [currentReport, prevReport] = await Promise.all([
        runReportApi('runReport', {
            dateRanges: [{ startDate: currentStart, endDate: 'today' }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'newUsers' },
                { name: 'sessions' },
                { name: 'averageSessionDuration' },
            ],
            dimensions: [{ name: 'date' }],
        }, target),
        runReportApi('runReport', {
            dateRanges: [{ startDate: prevStart, endDate: prevEnd }],
            metrics: [
                { name: 'activeUsers' },
                { name: 'newUsers' },
                { name: 'sessions' },
                { name: 'averageSessionDuration' },
            ],
            dimensions: [{ name: 'date' }],
        }, target),
    ]);

    const extractTotals = (rep) => {
        if (!rep.rows || rep.rows.length === 0) {
            return { activeUsers: 0, newUsers: 0, sessions: 0, avgDuration: 0 };
        }
        let activeUsers = 0;
        let newUsers = 0;
        let sessions = 0;
        let totalDuration = 0;

        rep.rows.forEach(r => {
            activeUsers += parseInt(r.metricValues[0].value, 10) || 0;
            newUsers += parseInt(r.metricValues[1].value, 10) || 0;
            sessions += parseInt(r.metricValues[2].value, 10) || 0;
            totalDuration += parseFloat(r.metricValues[3].value) || 0;
        });

        const avgDuration = rep.rows.length > 0 ? totalDuration / rep.rows.length : 0;
        return { activeUsers, newUsers, sessions, avgDuration };
    };

    const currentTotals = extractTotals(currentReport);
    const prevTotals = extractTotals(prevReport);

    const calcDelta = (curr, prev) => {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return ((curr - prev) / prev) * 100;
    };

    const currentDaily = (currentReport.rows || []).map(r => ({
        date: formatFirebaseDate(r.dimensionValues[0].value),
        users: parseInt(r.metricValues[0].value, 10) || 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const prevDaily = (prevReport.rows || []).map(r => ({
        date: formatFirebaseDate(r.dimensionValues[0].value),
        users: parseInt(r.metricValues[0].value, 10) || 0,
    })).sort((a, b) => a.date.localeCompare(b.date));

    return {
        periodDays,
        current: currentTotals,
        previous: prevTotals,
        deltas: {
            activeUsers: calcDelta(currentTotals.activeUsers, prevTotals.activeUsers).toFixed(1),
            newUsers: calcDelta(currentTotals.newUsers, prevTotals.newUsers).toFixed(1),
            sessions: calcDelta(currentTotals.sessions, prevTotals.sessions).toFixed(1),
            avgDuration: calcDelta(currentTotals.avgDuration, prevTotals.avgDuration).toFixed(1),
        },
        chartData: {
            currentDaily,
            prevDaily,
        }
    };
}

/**
 * Calculates current active users vs 7-day rolling hourly baseline for anomaly detection.
 */
export async function getTrafficAnomalyMetrics(target) {
    const [current30m, dailyReport] = await Promise.all([
        getActiveUsersLast30Minutes(target),
        getDailyActiveUsers('activeUsers', target, 7),
    ]);

    if (!dailyReport || dailyReport.length === 0) {
        return { isAnomaly: false, type: 'normal', current: current30m, baseline: current30m, deltaPercent: 0 };
    }

    const total7d = dailyReport.reduce((sum, d) => sum + Number(d.users || 0), 0);
    const dailyAvg = total7d / dailyReport.length;
    // Expected 30-min window baseline (approx dailyAvg / 48 half-hours)
    const expected30m = Math.max(Math.round(dailyAvg / 48), 5);

    const deltaPercent = expected30m > 0
        ? Math.round(((current30m - expected30m) / expected30m) * 100)
        : 0;

    let isAnomaly = false;
    let type = 'normal';

    // Spike threshold: +40% (min 15 users difference)
    if (deltaPercent >= 40 && current30m - expected30m >= 15) {
        isAnomaly = true;
        type = 'spike';
    } else if (deltaPercent <= -40 && expected30m - current30m >= 15) {
        isAnomaly = true;
        type = 'drop';
    }

    return {
        isAnomaly,
        type,
        current: current30m,
        baseline: expected30m,
        deltaPercent,
    };
}

export async function getActiveUsersLast30Minutes(target) {
    const data = await runReportApi('runRealtimeReport', {
        metrics: [{ name: 'activeUsers' }],
    }, target);

    if (data.rows && data.rows.length > 0) {
        return parseInt(data.rows[0].metricValues[0].value, 10);
    } else {
        return 0;
    }
}

export async function getAverageEngagementTime(target) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [
            { name: 'averageSessionDuration' },
            { name: 'engagementRate' },
            { name: 'userEngagementDuration' },
            { name: 'activeUsers' },
        ],
        dimensions: [{ name: 'date' }],
    }, target);

    if (!data.rows) return [];

    const sorted = data.rows
        .map(row => ({
            date: row.dimensionValues[0].value,
            avgSessionDuration: parseFloat(row.metricValues[0].value),
            engagementRate: parseFloat(row.metricValues[1].value),
            totalEngagementDuration: parseFloat(row.metricValues[2].value),
            activeUsers: parseInt(row.metricValues[3].value, 10),
        }))
        .sort((a, b) => parseInt(a.date, 10) - parseInt(b.date, 10));

    return sorted.map((row, index, array) => {
        const date = formatFirebaseDate(row.date);
        let durationGrow = null;
        if (index > 0) {
            const prev = array[index - 1].avgSessionDuration;
            if (prev > 0) {
                durationGrow = ((row.avgSessionDuration - prev) / prev) * 100;
            }
        }
        return {
            date,
            avgSessionDuration: row.avgSessionDuration,
            engagementRate: row.engagementRate,
            totalEngagementDuration: row.totalEngagementDuration,
            activeUsers: row.activeUsers,
            grow: durationGrow !== null ? durationGrow.toFixed(2) : null,
        };
    });
}

export async function getAllEvents(target, dateRange = '7daysAgo') {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'eventName' }],
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 50,
    }, target);

    if (!data.rows) return [];

    const totalEvents = data.rows.reduce((sum, row) => sum + parseInt(row.metricValues[0].value, 10), 0);

    return data.rows.map(row => ({
        eventName: row.dimensionValues[0].value,
        count: parseInt(row.metricValues[0].value, 10),
        percentage: totalEvents > 0 ? ((parseInt(row.metricValues[0].value, 10) / totalEvents) * 100).toFixed(1) : "0.0",
    }));
}

export async function getEventParameterBreakdown(eventName, paramName, target, dateRange = '7daysAgo') {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [
            { name: 'eventName' },
            { name: `customEvent:${paramName}` },
        ],
        dimensionFilter: {
            filter: {
                fieldName: 'eventName',
                stringFilter: { value: eventName, matchType: 'EXACT' },
            },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 50,
    }, target);

    if (!data.rows) return { eventName, paramName, totalCount: 0, values: [] };

    const totalCount = data.rows.reduce((sum, row) => sum + parseInt(row.metricValues[0].value, 10), 0);

    const values = data.rows
        .map(row => {
            const paramValue = row.dimensionValues[1].value;
            const count = parseInt(row.metricValues[0].value, 10);
            return {
                value: paramValue === '(not set)' ? '(not set)' : paramValue,
                count,
                percentage: totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : "0.0",
            };
        })
        .filter(v => v.value !== '(not set)' || v.count > 0);

    return { eventName, paramName, totalCount, values };
}

export async function getCustomDimensions(target) {
    const creds = await getCredentials(target);
    if (!creds.propertyId) {
        throw new Error("Property ID is missing for this account.");
    }

    const accessToken = await getAccessToken(creds);
    const url = `https://analyticsadmin.googleapis.com/v1beta/properties/${creds.propertyId}/customDimensions`;

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Admin API request failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    if (!data.customDimensions) return [];

    return data.customDimensions
        .filter(d => d.scope === 'EVENT')
        .map(d => ({
            paramName: d.parameterName,
            displayName: d.displayName,
        }));
}

export async function getMultiParamBreakdown(eventName, primaryParam, secondaryParam, target, dateRange = '7daysAgo') {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [
            { name: `customEvent:${primaryParam}` },
            { name: `customEvent:${secondaryParam}` },
        ],
        dimensionFilter: {
            filter: {
                fieldName: 'eventName',
                stringFilter: { value: eventName, matchType: 'EXACT' },
            },
        },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 250,
    }, target);

    if (!data.rows) return { eventName, primaryParam, secondaryParam, groups: [] };

    const groupMap = new Map();

    for (const row of data.rows) {
        const primaryVal = row.dimensionValues[0].value;
        const secondaryVal = row.dimensionValues[1].value;
        const count = parseInt(row.metricValues[0].value, 10);

        if (!groupMap.has(primaryVal)) {
            groupMap.set(primaryVal, { key: primaryVal, totalCount: 0, items: [] });
        }

        const group = groupMap.get(primaryVal);
        group.totalCount += count;
        group.items.push({ value: secondaryVal, count });
    }

    const groups = Array.from(groupMap.values()).map(g => {
        return {
            key: g.key,
            totalCount: g.totalCount,
            items: g.items.map(item => ({
                value: item.value,
                count: item.count,
                percentage: g.totalCount > 0 ? ((item.count / g.totalCount) * 100).toFixed(1) : "0.0",
            })).sort((a, b) => b.count - a.count),
        };
    });

    return { eventName, primaryParam, secondaryParam, groups };
}

/**
 * Fetches comprehensive metadata and live analytics profile for a project.
 */
export async function getProjectDetails(target) {
    const creds = await getCredentials(target);
    const propertyId = creds.propertyId;
    if (!propertyId) {
        throw new Error("Property ID is missing for this account.");
    }

    const details = {
        name: creds.name,
        propertyId,
        clientEmail: creds.clientEmail,
        timeZone: null,
        currencyCode: null,
        industryCategory: null,
        displayName: null,
        dataStreams: [],
        metrics: {
            active30m: 0,
            todayActive: 0,
            lifetimeUsers: 0,
        },
        topEvents: [],
    };

    // 1. Fetch live metrics (Data API)
    try {
        const [active30m, lifetimeUsers, dailyReport, events] = await Promise.all([
            getActiveUsersLast30Minutes(target).catch(() => 0),
            getLifetimeActiveUsers(target).catch(() => 0),
            getDailyActiveUsers('activeUsers', target).catch(() => []),
            getAllEvents(target).catch(() => []),
        ]);

        details.metrics.active30m = active30m;
        details.metrics.lifetimeUsers = lifetimeUsers;
        if (dailyReport && dailyReport.length > 0) {
            const todayItem = dailyReport[dailyReport.length - 1];
            details.metrics.todayActive = todayItem?.users || 0;
            details.metrics.todayGrow = todayItem?.grow || null;
        }
        details.topEvents = (events || []).slice(0, 5);
    } catch (e) {
        console.warn("Could not fetch metrics in getProjectDetails:", e.message);
    }

    // 2. Fetch GA4 Admin metadata (Admin API)
    try {
        const accessToken = await getAccessToken(creds);

        // Fetch Property metadata
        const propRes = await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (propRes.ok) {
            const propData = await propRes.json();
            details.timeZone = propData.timeZone || null;
            details.currencyCode = propData.currencyCode || null;
            details.industryCategory = propData.industryCategory || null;
            details.displayName = propData.displayName || null;
            details.createTime = propData.createTime || null;
        }

        // Fetch Data Streams
        const streamsRes = await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (streamsRes.ok) {
            const streamsData = await streamsRes.json();
            if (streamsData.dataStreams) {
                details.dataStreams = streamsData.dataStreams.map(s => {
                    let platform = 'WEB';
                    let appIdOrUri = s.webStreamData?.defaultUri || null;

                    if (s.type === 'ANDROID_APP_DATA_STREAM') {
                        platform = 'ANDROID';
                        appIdOrUri = s.androidAppStreamData?.packageName || null;
                    } else if (s.type === 'IOS_APP_DATA_STREAM') {
                        platform = 'IOS';
                        appIdOrUri = s.iosAppStreamData?.bundleId || null;
                    }

                    return {
                        name: s.displayName,
                        type: s.type,
                        platform,
                        appIdOrUri,
                        streamId: s.name ? s.name.split('/').pop() : null,
                    };
                });
            }
        }
    } catch (adminErr) {
        // Admin API call is optional if permissions are limited to Viewer only
    }

    return details;
}
