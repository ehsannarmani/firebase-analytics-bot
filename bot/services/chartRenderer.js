import { InputFile } from "grammy";

/**
 * Serverless, Cloudflare Workers-compatible chart image renderer.
 * Generates polished, high-definition PNG chart images tailored for Telegram dark mode.
 */

const QUICKCHART_ENDPOINT = "https://quickchart.io/chart";

/**
 * Renders a Chart.js configuration into a Telegram-compatible InputFile.
 * 
 * @param {object} chartConfig - Chart.js configuration object
 * @param {object} options - custom dimensions & styling
 * @returns {Promise<{ inputFile: InputFile|null, url: string|null }>}
 */
export async function renderChartImage(chartConfig, options = {}) {
    if (!chartConfig) return { inputFile: null, url: null };

    const width = options.width || 850;
    const height = options.height || 480;
    const backgroundColor = options.backgroundColor || "#18181b";
    const devicePixelRatio = options.devicePixelRatio || 2;

    const payload = {
        chart: chartConfig,
        width,
        height,
        backgroundColor,
        devicePixelRatio,
        format: 'png',
    };

    try {
        const res = await fetch(QUICKCHART_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'image/png',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Chart rendering service returned status ${res.status}: ${errText}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const inputFile = new InputFile(uint8Array, "chart.png");

        return {
            inputFile,
            url: null,
        };
    } catch (error) {
        console.error("Error rendering chart image:", error.message);

        // Fallback: Return direct GET URL if POST fails
        try {
            const encoded = encodeURIComponent(JSON.stringify(chartConfig));
            const fallbackUrl = `${QUICKCHART_ENDPOINT}?c=${encoded}&w=${width}&h=${height}&bkg=${encodeURIComponent(backgroundColor)}&devicePixelRatio=${devicePixelRatio}`;
            return {
                inputFile: null,
                url: fallbackUrl,
            };
        } catch (e) {
            return { inputFile: null, url: null };
        }
    }
}
