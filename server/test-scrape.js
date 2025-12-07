const https = require('https');

const testUrl = 'https://www.tiktok.com/@tiktok/video/7106734663673318699';
const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(testUrl)}`;

https.get(oembedUrl, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log(data);
    });
}).on('error', console.error);
