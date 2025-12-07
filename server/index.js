import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
    version: '3.0.0',
    status: 'running',
    mode: 'oEmbed API (Official TikTok Integration)',
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
      lastActivity: Date.now()
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

// ============= TIKTOK OEMBED API =============
/**
 * Extract TikTok video metadata using official oEmbed API
 * @param {string} videoUrl - TikTok video URL
 * @returns {Promise<Object|null>} oEmbed data or null on failure
 */
const getTikTokOEmbedData = async (videoUrl) => {
  try {
    console.log(`[oEmbed API] Fetching metadata for: ${videoUrl.substring(0, 60)}...`);
    
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      console.error(`[oEmbed API] HTTP Error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    
    console.log(`[oEmbed API] Success! Title: ${data.title || 'Unknown'}`);
    
    return {
      title: data.title,
      author_name: data.author_name,
      author_url: data.author_url,
      thumbnail_url: data.thumbnail_url,
      embed_html: data.html,
      provider_name: data.provider_name,
      provider_url: data.provider_url,
      width: data.width,
      height: data.height,
      version: data.version
    };
  } catch (error) {
    console.error(`[oEmbed API Error] ${error.message}`);
    return null;
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
      socketId: socket.id
    });

    console.log(`[Join] ${userId} joined ${roomId}`);

    socket.emit('room_state', {
      queue: room.queue,
      messages: room.messages,
      currentVideoIndex: room.currentVideoIndex,
      playing: room.playing,
      currentTime: room.currentTime
    });

    io.to(roomId).emit('system_message', {
      id: Date.now(),
      text: `✅ ${userId} joined the room`,
      timestamp: new Date().toLocaleTimeString(),
      isSystem: true
    });
    
    io.to(roomId).emit('room_users_count', room.users.size);
  });

  socket.on('add_video', async ({ roomId, video }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const videoWithState = { 
      ...video, 
      isProcessing: true,
      oembedData: null,
      extractionAttempted: false
    };
    
    room.queue.push(videoWithState);
    io.to(roomId).emit('update_queue', room.queue);

    io.to(roomId).emit('system_message', {
      id: Date.now(),
      text: `⏳ Fetching video metadata...`,
      timestamp: new Date().toLocaleTimeString(),
      isSystem: true
    });

    // Check cache first
    let oembedData;
    if (videoCache.has(video.url)) {
      console.log(`[Cache Hit] ${video.url.substring(0, 60)}...`);
      oembedData = videoCache.get(video.url);
    } else {
      // Fetch from TikTok oEmbed API
      oembedData = await getTikTokOEmbedData(video.url);
      
      // Cache the result
      if (oembedData) {
        videoCache.set(video.url, oembedData);
        if (videoCache.size > maxCacheSize) {
          const firstKey = videoCache.keys().next().value;
          videoCache.delete(firstKey);
        }
      }
    }

    const videoIndex = room.queue.findIndex(v => v.id === video.id);
    if (videoIndex !== -1) {
      room.queue[videoIndex].extractionAttempted = true;
      room.queue[videoIndex].oembedData = oembedData;
      room.queue[videoIndex].isProcessing = false;
      
      if (oembedData) {
        console.log(`[Success] oEmbed data retrieved for: ${oembedData.title}`);
        
        io.to(roomId).emit('system_message', {
          id: Date.now(),
          text: `✅ Video ready: ${oembedData.title || 'TikTok Video'}`,
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true
        });
      } else {
        console.log(`[Fallback] oEmbed API failed - using standard embed`);
        
        io.to(roomId).emit('system_message', {
          id: Date.now(),
          text: `⚠️ Using standard TikTok embed`,
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
🚀 TikTok Watch Together Server (v3.0.0 - oEmbed API)
   Port: ${PORT}
   Mode: Official TikTok oEmbed Integration
   Environment: ${process.env.NODE_ENV || 'development'}
   Timestamp: ${new Date().toISOString()}\n`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { io, rooms };