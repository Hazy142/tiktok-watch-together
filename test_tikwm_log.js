
import fs from 'fs';

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync('debug_log.txt', msg + '\n');
};

const expandUrl = async (url) => {
    try {
        const response = await fetch(url, {
            redirect: 'follow',
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        return response.url;
    } catch (e) {
        log(`[Expand] Error: ${e.message}`);
        return url;
    }
};

const resolveTikTokUrl = async (rawUrl) => {
    fs.writeFileSync('debug_log.txt', ''); // Clear log
    log(`Original: ${rawUrl}`);
    // 1. URL Expandieren
    const url = await expandUrl(rawUrl);
    log(`Expanded: ${url}`);

    // STRATEGIE 1: TikWM API
    try {
        const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        log(`fetching ${tikwmUrl}`);
        const response = await fetch(tikwmUrl);
        const data = await response.json();

        log(`TikWM Msg: ${data.msg}`);
        if (data?.data?.play) {
            log(`✅ [TikWM] MP4 gefunden!`);
        }
    } catch (e) {
        log(`💥 [TikWM] Error: ${e.message}`);
    }
};

const url = 'https://www.tiktok.com/@fraufortuna/video/7569189568063278358';
resolveTikTokUrl(url);
