const https = require('https');

const tiktokUrl = 'https://www.tiktok.com/@tiktok/video/7106734663673318699';
const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`;

https.get(apiUrl, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('Success:', json.data ? 'Yes' : 'No');
            if (json.data && json.data.play) {
                console.log('Video URL:', json.data.play);
            }
        } catch (e) {
            console.error('Parse Error', e);
            console.log('Raw:', data);
        }
    });
}).on('error', console.error);
