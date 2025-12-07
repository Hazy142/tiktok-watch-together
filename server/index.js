import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Production-grade Socket.io config
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  maxHttpBufferSize: 1e7,
  transports: ['websocket', 'polling']
});

// ============= MIDDLEWARE =============
app.use(express.json());
app.use(express.static(join(__dirname, '../dist')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'TikTok Watch Together',
    version: '2.1.0',
    status: 'running',
    mode: 'Hybrid (Auto-Streamer Fallback)',
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// ============= STATE MANAGEMENT =============
const rooms = new Map();
const videoCache = new Map();
const maxCacheSize = 100;

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      queue: [],
      messages: [],
      currentVideoIndex: 0,
      playing: false,
      currentTime: 0,
      users: new Map(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      
      // Streamer mode
      streamerId: null,
      isStreamMode: false,
      streamData: {
        screenBuffer: null,
        cursorX: 0,
        cursorY: 0,
        videoSrc: null
      }
    });
  }
  const room = rooms.get(roomId);
  room.lastActivity = Date.now();
  return room;
};

// Cleanup inactive rooms
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000;
  
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && now - room.lastActivity > timeout) {
      console.log(`[Cleanup] Removing inactive room: ${roomId}`);
      rooms.delete(roomId);
    }
  }
}, 30 * 60 * 1000);

// ============= SCRAPING WITH QUEUE SYSTEM =============
const scraperQueue = [];
let isScrapingActive = false;
let scrapingBrowser = null;

const initScrapingBrowser = async () => {
  if (!scrapingBrowser) {
    try {
      scrapingBrowser = await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--window-size=1920,1080',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-sync'
        ]
      });
      console.log('[Browser] Initialized with Stealth Mode');
    } catch (error) {
      console.error('[Browser Error]', error.message);
      scrapingBrowser = null;
      throw error;
    }
  }
  return scrapingBrowser;
};

const closeScraper = async () => {
  if (scrapingBrowser) {
    await scrapingBrowser.close();
    scrapingBrowser = null;
  }
};

const scrapeVideoQueue = async () => {
  if (isScrapingActive || scraperQueue.length === 0) return;
  
  isScrapingActive = true;
  
  while (scraperQueue.length > 0) {
    const { url, resolve, reject, roomId, videoId, socketId } = scraperQueue.shift();
    
    try {
      if (videoCache.has(url)) {
        console.log(`[Cache Hit] ${url.substring(0, 60)}...`);
        resolve(videoCache.get(url));
        continue;
      }
      
      const browser = await initScrapingBrowser();
      const page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      );
      
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      });
      
      await page.setViewport({ width: 1920, height: 1080 });
      
      console.log(`[Scraping] Attempting: ${url.substring(0, 60)}...`);
      
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle0',
          timeout: 10000  // Short timeout for quick fallback
        });
        
        // Try to find video with SHORT timeout
        try {
          await page.waitForSelector('video', { timeout: 3000 });
        } catch (e) {
          console.log(`[Timeout] No video found - will use Screen Share`);
          await page.close();
          resolve(null);
          continue;
        }
        
        const videoSrc = await page.evaluate(() => {
          const video = document.querySelector('video');
          if (video) {
            const src = video.src || (video.querySelector('source')?.src);
            if (src && src.startsWith('http')) return src;
          }
          
          const sources = document.querySelectorAll('video source');
          for (let source of sources) {
            const src = source.src || source.getAttribute('src');
            if (src && src.startsWith('http')) return src;
          }
          
          return null;
        });
        
        await page.close();
        
        if (videoSrc) {
          videoCache.set(url, videoSrc);
          if (videoCache.size > maxCacheSize) {
            const firstKey = videoCache.keys().next().value;
            videoCache.delete(firstKey);
          }
          
          console.log(`[Success] MP4 Found! ${url.substring(0, 60)}...`);
          resolve(videoSrc);
        } else {
          console.log(`[Failed] No MP4 URL - Screen Share will activate`);
          resolve(null);
        }
      } catch (error) {
        console.error(`[Scrape Error] ${error.message}`);
        await page.close();
        resolve(null);
      }
    } catch (error) {
      console.error(`[Critical Error] ${error.message}`);
      resolve(null);
    }
  }
  
  isScrapingActive = false;
};

setInterval(scrapeVideoQueue, 500);

const queueVideoScrape = (url, roomId, videoId, socketId) => {
  return new Promise((resolve, reject) => {
    scraperQueue.push({ url, resolve, reject, roomId, videoId, socketId });
    scrapeVideoQueue();
  });
};

// ============= SCREEN CAPTURE =============
const activeStreams = new Map();

const takeScreenshot = async (url) => {
  try {
    const browser = await initScrapingBrowser();
    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    const screenshot = await page.screenshot({ encoding: 'base64' });
    await page.close();
    
    return screenshot;
  } catch (error) {
    console.error(`[Screenshot Error] ${error.message}`);
    return null;
  }
};

const startScreenCapture = async (roomId, url) => {
  if (activeStreams.has(roomId)) return;
  
  console.log(`[Stream] Starting screen capture for room ${roomId}`);
  
  activeStreams.set(roomId, setInterval(async () => {
    const screenshot = await takeScreenshot(url);
    if (screenshot) {
      io.to(roomId).emit('stream_frame', {
        data: 'data:image/png;base64,' + screenshot,
        timestamp: Date.now()
      });
    }
  }, 100));  // 10 FPS
};

const stopScreenCapture = (roomId) => {
  if (activeStreams.has(roomId)) {
    clearInterval(activeStreams.get(roomId));
    activeStreams.delete(roomId);
    console.log(`[Stream] Stopped screen capture for room ${roomId}`);
  }
};

// ============= SOCKET.IO EVENT HANDLERS =============
io.on('connection', (socket) => {
  console.log(`[Connected] ${socket.id}`);

  socket.on('join_room', ({ roomId, userId }) => {
    if (!roomId || !userId) {
      socket.emit('error', 'Invalid room or user ID');
      return;
    }
    
    socket.join(roomId);
    const room = getRoom(roomId);
    room.users.set(userId, { 
      joinedAt: Date.now(), 
      socketId: socket.id,
      isStreamer: false 
    });

    console.log(`[Join] ${userId} joined ${roomId}`);

    socket.emit('room_state', {
      queue: room.queue,
      messages: room.messages,
      currentVideoIndex: room.currentVideoIndex,
      playing: room.playing,
      currentTime: room.currentTime,
      streamerId: room.streamerId,
      isStreamMode: room.isStreamMode
    });

    io.to(roomId).emit('system_message', {
      id: Date.now(),
      text: `✅ ${userId} joined the room`,
      timestamp: new Date().toLocaleTimeString(),
      isSystem: true
    });
    
    io.to(roomId).emit('room_users_count', room.users.size);
  });

  socket.on('request_streamer_role', ({ roomId, userId }) => {
    const room = getRoom(roomId);
    
    if (!room.streamerId) {
      room.streamerId = userId;
      room.isStreamMode = true;
      room.users.get(userId).isStreamer = true;
      
      io.to(roomId).emit('streamer_assigned', {
        streamerId: userId,
        message: `🎬 ${userId} is now the streamer`,
        isAutomatic: false
      });
      
      console.log(`[Streamer] ${userId} manually became streamer in ${roomId}`);
    }
  });

  socket.on('add_video', async ({ roomId, video }) => {
    const room = getRoom(roomId);
    if (!room) return;
    
    // Get first user ID for auto-streamer
    const firstUserId = Array.from(room.users.keys())[0] || 'System';

    const videoWithState = { 
      ...video, 
      isProcessing: true,
      mp4Url: null,
      useScreenShare: false,
      extractionAttempted: false
    };
    
    room.queue.push(videoWithState);
    io.to(roomId).emit('update_queue', room.queue);

    io.to(roomId).emit('system_message', {
      id: Date.now(),
      text: `⏳ Processing video...`,
      timestamp: new Date().toLocaleTimeString(),
      isSystem: true
    });

    // SHORT timeout: 5 seconds for MP4 extraction
    const timeoutPromise = new Promise(resolve => 
      setTimeout(() => resolve(null), 5000)  // 5s only!
    );
    
    console.log(`[Add Video] Attempting MP4 extraction (5s timeout)...`);
    const mp4Url = await Promise.race([
      queueVideoScrape(video.url, roomId, video.id, socket.id),
      timeoutPromise
    ]);

    const videoIndex = room.queue.findIndex(v => v.id === video.id);
    if (videoIndex !== -1) {
      room.queue[videoIndex].extractionAttempted = true;
      room.queue[videoIndex].mp4Url = mp4Url;
      room.queue[videoIndex].isProcessing = false;
      
      if (mp4Url) {
        // SUCCESS: MP4 extracted
        console.log(`[Success] MP4 extracted - using Direct Player`);
        room.queue[videoIndex].useScreenShare = false;
        
        io.to(roomId).emit('system_message', {
          id: Date.now(),
          text: `✅ Perfect sync! Direct MP4 found.`,
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true
        });
      } else {
        // FAIL: Start Auto-Screenshare
        console.log(`[Fallback] MP4 extraction failed - starting Screen Share mode`);
        room.queue[videoIndex].useScreenShare = true;
        
        // Assign auto-streamer if not already assigned
        if (!room.streamerId) {
          room.streamerId = firstUserId;
          room.isStreamMode = true;
          room.users.get(firstUserId).isStreamer = true;
          
          // Start screen capture for this URL
          startScreenCapture(roomId, video.url);
          
          io.to(roomId).emit('streamer_assigned', {
            streamerId: firstUserId,
            message: `🎬 Auto-started Screen Share (MP4 extraction failed)`,
            isAutomatic: true
          });
          
          console.log(`[Auto-Streamer] ${firstUserId} assigned to ${roomId}`);
        }
        
        io.to(roomId).emit('system_message', {
          id: Date.now(),
          text: `🎬 MP4 extraction failed. Using Screen Share mode for perfect sync!`,
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true
        });
      }
      
      io.to(roomId).emit('update_queue', room.queue);
    }
  });

  socket.on('remove_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (!room || index < 0 || index >= room.queue.length) return;

    room.queue.splice(index, 1);
    
    if (room.currentVideoIndex >= index && room.currentVideoIndex > 0) {
      room.currentVideoIndex--;
    } else if (room.currentVideoIndex >= room.queue.length && room.queue.length > 0) {
      room.currentVideoIndex = room.queue.length - 1;
    }

    io.to(roomId).emit('update_queue', room.queue);
    io.to(roomId).emit('update_index', room.currentVideoIndex);
  });

  socket.on('change_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (!room || index < 0 || index >= room.queue.length) return;

    room.currentVideoIndex = index;
    room.playing = true;
    room.currentTime = 0;
    
    io.to(roomId).emit('update_index', index);
    io.to(roomId).emit('player_state', { playing: true, time: 0 });
  });

  socket.on('send_message', ({ roomId, message }) => {
    const room = getRoom(roomId);
    if (!room) return;

    room.messages.push(message);
    if (room.messages.length > 100) {
      room.messages.shift();
    }
    
    io.to(roomId).emit('new_message', message);
  });

  socket.on('player_play', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (!room) return;

    room.playing = true;
    room.currentTime = time || 0;
    socket.to(roomId).emit('player_state', { playing: true, time: room.currentTime });
  });

  socket.on('player_pause', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (!room) return;

    room.playing = false;
    room.currentTime = time || 0;
    socket.to(roomId).emit('player_state', { playing: false, time: room.currentTime });
  });

  socket.on('player_seek', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (!room) return;

    room.currentTime = time || 0;
    socket.to(roomId).emit('player_seek', time);
  });

  socket.on('request_countdown', ({ roomId }) => {
    io.to(roomId).emit('start_countdown', 3);
    io.to(roomId).emit('system_message', {
      id: Date.now(),
      text: '⏱️ 3... 2... 1... GO!',
      timestamp: new Date().toLocaleTimeString(),
      isSystem: true
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Disconnected] ${socket.id}`);
  });

  socket.on('error', (error) => {
    console.error(`[Socket Error] ${socket.id}: ${error}`);
  });
});

// ============= ERROR HANDLING =============
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// ============= SERVER STARTUP =============
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
🚀 TikTok Watch Together Server (v2.1.0 - Hybrid Approach)
   Port: ${PORT}
   Mode: Auto-Streamer Fallback on MP4 Extraction Failure
   Environment: ${process.env.NODE_ENV || 'development'}
   Timestamp: ${new Date().toISOString()}\n`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await closeScraper();
  activeStreams.forEach((interval) => clearInterval(interval));
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { io, rooms };
