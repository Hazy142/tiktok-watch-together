
const checkRedirect = async (url) => {
    console.log(`\n🔍 Checking redirect for: ${url}`);
    try {
        const response = await fetch(url, {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log(`Original URL: ${url}`);
        console.log(`Final URL: ${response.url}`);
        console.log(`Status: ${response.status}`);
    } catch (e) {
        console.error(`💥 Error: ${e.message}`);
    }
};

const url = 'https://www.tiktok.com/e412b5e4-71e6-4777-b2a3-aa888d27903b';
checkRedirect(url);
