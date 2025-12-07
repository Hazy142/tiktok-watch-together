const puppeteer = require('puppeteer');

const tiktokUrl = 'https://www.tiktok.com/@tiktok/video/7106734663673318699';

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set User Agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    console.log('Navigating to URL...');
    try {
        await page.goto(tiktokUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
        console.error('Navigation error (continuing anyway):', e.message);
    }

    console.log('Waiting for video...');
    // Wait for video tag
    try {
        await page.waitForSelector('video', { timeout: 30000 });

        const videoSrc = await page.evaluate(() => {
            const video = document.querySelector('video');
            return video ? video.src : null;
        });

        console.log('Video Source:', videoSrc);
    } catch (e) {
        console.error('Error finding video:', e.message);
        // Debug: Print title
        const title = await page.title();
        console.log('Page Title:', title);
    }

    await browser.close();
})();
