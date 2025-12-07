
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
        console.log(`[Expand] Error: ${e.message}`);
        return url;
    }
};

const resolveTikTokUrl = async (rawUrl) => {
    console.log(`Original: ${rawUrl}`);
    const url = await expandUrl(rawUrl);
    console.log(`Expanded: ${url}`);

    // STRATEGIE 1: TikWM API
    try {
        const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
        console.log(`fetching ${tikwmUrl}`);
        const response = await fetch(tikwmUrl);
        const data = await response.json();

        console.log(`TikWM Msg: ${data.msg}`);
        if (data?.data?.play) {
            console.log(`✅ [TikWM] MP4 gefunden!`);
            // console.log(data.data.play);
        } else {
            console.log('❌ [TikWM] Failed');
        }
    } catch (e) {
        console.error(`💥 [TikWM] Error: ${e.message}`);
    }
};

const url = 'https://www.tiktok.com/@fraufortuna/video/7569189568063278358';
resolveTikTokUrl(url);
