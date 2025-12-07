import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('TikTok Watch Together API Server is running.');
});

// Store room state in memory
const rooms = new Map();

const getRoom = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      queue: [],
      messages: [],
      currentVideoIndex: 0,
      playing: false,
      currentTime: 0,
      users: new Set()
    });
  }
  return rooms.get(roomId);
};

// Scrape function
async function scrapeTikTokVideo(url) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
      ]
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('video', { timeout: 30000 });

    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.src : null;
    });

    return videoSrc;
  } catch (error) {
    console.error('Scrape error:', error.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, userId }) => {
    socket.join(roomId);
    const room = getRoom(roomId);
    room.users.add(userId);

    socket.emit('room_state', {
      queue: room.queue,
      messages: room.messages,
      currentVideoIndex: room.currentVideoIndex,
      playing: room.playing,
      currentTime: room.currentTime
    });

    io.to(roomId).emit('system_message', {
      text: `${userId} joined the room.`
    });
  });

  socket.on('add_video', async ({ roomId, video }) => {
    const room = getRoom(roomId);

    // Add placeholder first
    const videoWithPlaceholder = { ...video, isProcessing: true };
    room.queue.push(videoWithPlaceholder);
    io.to(roomId).emit('update_queue', room.queue);

    io.to(roomId).emit('system_message', {
      text: `Processing video from ${video.addedBy}...`
    });

    // Scrape in background
    const mp4Url = await scrapeTikTokVideo(video.url);

    // Update video in queue
    const targetIndex = room.queue.findIndex(v => v.id === video.id);
    if (targetIndex !== -1) {
      room.queue[targetIndex].mp4Url = mp4Url;
      room.queue[targetIndex].isProcessing = false;
      io.to(roomId).emit('update_queue', room.queue);

      if (mp4Url) {
        io.to(roomId).emit('system_message', {
          text: `Video ready!`
        });
      } else {
        io.to(roomId).emit('system_message', {
          text: `Failed to extract video. Using embed fallback.`
        });
      }
    }
  });

  socket.on('remove_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (index >= 0 && index < room.queue.length) {
      room.queue.splice(index, 1);
      if (room.currentVideoIndex >= index && room.currentVideoIndex > 0) {
        room.currentVideoIndex--;
      } else if (room.currentVideoIndex >= room.queue.length && room.queue.length > 0) {
        room.currentVideoIndex = room.queue.length - 1;
      }

      io.to(roomId).emit('update_queue', room.queue);
      io.to(roomId).emit('update_index', room.currentVideoIndex);
    }
  });

  socket.on('change_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (index >= 0 && index < room.queue.length) {
      room.currentVideoIndex = index;
      room.playing = true;
      room.currentTime = 0;
      io.to(roomId).emit('update_index', index);
      io.to(roomId).emit('player_state', { playing: true, time: 0 });
    }
  });

  socket.on('send_message', ({ roomId, message }) => {
    const room = getRoom(roomId);
    room.messages.push(message);
    if (room.messages.length > 50) {
      room.messages.shift();
    }
    io.to(roomId).emit('new_message', message);
  });

  socket.on('player_play', ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.playing = true;
    room.currentTime = time;
    socket.to(roomId).emit('player_state', { playing: true, time });
  });

  socket.on('player_pause', ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.playing = false;
    room.currentTime = time;
    socket.to(roomId).emit('player_state', { playing: false, time });
  });

  socket.on('player_seek', ({ roomId, time }) => {
    const room = getRoom(roomId);
    room.currentTime = time;
    socket.to(roomId).emit('player_seek', time);
  });

  socket.on('request_countdown', ({ roomId }) => {
    io.to(roomId).emit('start_countdown', 3);
    io.to(roomId).emit('system_message', { text: 'Starting countdown: 3... 2... 1... PLAY!' });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
