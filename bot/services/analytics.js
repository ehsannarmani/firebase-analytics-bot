import { formatFirebaseDate } from "./dateUtils.js";

let cachedToken = null;
let tokenExpiresAt = 0;

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

async function getCredentials(env = {}) {
    const jsonVal = env?.SERVICE_ACCOUNT_JSON || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_JSON : undefined);
    if (jsonVal) {
        try {
            const parsed = typeof jsonVal === 'object' ? jsonVal : JSON.parse(jsonVal);
            const propertyId = env?.PROPERTY_ID || (typeof process !== 'undefined' ? process.env?.PROPERTY_ID : undefined) || parsed.property_id;
            return {
                clientEmail: parsed.client_email,
                privateKey: parsed.private_key,
                propertyId
            };
        } catch (e) {
            console.error("Failed to parse SERVICE_ACCOUNT_JSON:", e);
        }
    }

    const clientEmail = env?.SERVICE_ACCOUNT_CLIENT_EMAIL || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_CLIENT_EMAIL : undefined);
    const privateKey = env?.SERVICE_ACCOUNT_PRIVATE_KEY || (typeof process !== 'undefined' ? process.env?.SERVICE_ACCOUNT_PRIVATE_KEY : undefined);
    const propertyId = env?.PROPERTY_ID || (typeof process !== 'undefined' ? process.env?.PROPERTY_ID : undefined);

    if (clientEmail && privateKey) {
        return {
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
            propertyId
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
                privateKey: parsed.private_key,
                propertyId: propertyId || parsed.property_id
            };
        } catch (e) {
            console.error("Failed to load service account file from path:", e);
        }
    }

    throw new Error("Google Service Account credentials not found. Please set SERVICE_ACCOUNT_JSON, SERVICE_ACCOUNT_CLIENT_EMAIL & SERVICE_ACCOUNT_PRIVATE_KEY, or SERVICE_ACCOUNT_PATH.");
}

async function getAccessToken(credentials) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedToken && tokenExpiresAt > now + 60) {
        return cachedToken;
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

    const binaryKey = pemToBinary(credentials.privateKey);
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
        throw new Error(`Google OAuth token request failed (${res.status}): ${errText}`);
    }

    const tokenData = await res.json();
    cachedToken = tokenData.access_token;
    tokenExpiresAt = now + (tokenData.expires_in || 3600);
    return cachedToken;
}

async function runReportApi(endpoint, body, env) {
    const creds = await getCredentials(env);
    if (!creds.propertyId) {
        throw new Error("PROPERTY_ID is missing from environment/credentials.");
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
        throw new Error(`Analytics API request failed (${res.status}): ${errText}`);
    }

    return await res.json();
}

export async function getLifetimeUsersByCountry(env) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }],
        dimensions: [{ name: 'country' }],
    }, env);

    if (!data.rows) return [];
    return data.rows.map(row => ({
        country: row.dimensionValues[0].value,
        users: parseInt(row.metricValues[0].value, 10),
    }));
}

export async function getLifetimeActiveUsers(env) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '2020-01-01', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }],
    }, env);

    if (data.rows && data.rows.length > 0) {
        return parseInt(data.rows[0].metricValues[0].value, 10);
    } else {
        throw new Error('No data found for lifetime active users.');
    }
}

export async function getDailyActiveUsersPerAppVersion(metricName = 'activeUsers', dimensionName = 'appVersion', env) {
    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: metricName }],
        dimensions: [{ name: dimensionName }],
    }, env);

    if (!data.rows) return [];
    return data.rows.map(item => ({
        version: item.dimensionValues[0].value,
        users: item.metricValues[0].value
    }));
}

export async function getDailyActiveUsers(metrics = 'activeUsers', env) {
    // If 2nd parameter was passed as env vs default metrics
    if (typeof metrics === 'object') {
        env = metrics;
        metrics = 'activeUsers';
    }

    const data = await runReportApi('runReport', {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: metrics }],
        dimensions: [{ name: 'date' }],
    }, env);

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

export async function getActiveUsersLast30Minutes(env) {
    const data = await runReportApi('runRealtimeReport', {
        dateRanges: [{ startDate: '30minutesAgo', endDate: 'now' }],
        metrics: [{ name: 'activeUsers' }],
    }, env);

    if (data.rows && data.rows.length > 0) {
        return parseInt(data.rows[0].metricValues[0].value, 10);
    } else {
        throw new Error('No data found for the last 30 minutes.');
    }
}
