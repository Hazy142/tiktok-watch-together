
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
        console.error(`[Expand] Error: ${e.message}`);
        return url;
    }
};

const resolveTikTokUrl = async (rawUrl) => {
    console.log(`Original: ${rawUrl}`);
    // 1. URL Expandieren
    const url = await expandUrl(rawUrl);
    console.log(`Expanded: ${url}`);

    // STRATEGIE 1: TikWM API
    try {
        const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        console.log(`fetching ${tikwmUrl}`);
        const response = await fetch(tikwmUrl);
        const data = await response.json();

        console.log('TikWM Msg:', data.msg);
        if (data?.data?.play) {
            console.log(`✅ [TikWM] MP4 gefunden!`);
        }
    } catch (e) {
        console.error(`💥 [TikWM] Error: ${e.message}`);
    }
};

const url = 'https://www.tiktok.com/e412b5e4-71e6-4777-b2a3-aa888d27903b';
resolveTikTokUrl(url);
