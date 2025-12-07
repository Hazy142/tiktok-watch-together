import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ============= 🛡️ CORS PROXY FÜR MP4 VIDEOS =============
// Löst das CORS-Problem: Dein Server holt das Video und reicht es weiter
app.get('/proxy-video', async (req, res) => {
  const videoUrl = req.query.url;
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'URL parameter missing' });
  }
  
  console.log(`\n🎥 [Proxy] Streaming: ${videoUrl.substring(0, 60)}...`);
  
  try {
    const response = await fetch(videoUrl, {
      headers: {
        'Referer': 'https://www.tiktok.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ [Proxy] HTTP ${response.status}`);
      return res.status(response.status).json({ error: 'Video fetch failed' });
    }
    
    // CORS Headers setzen
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Handle Range requests (wichtig für Video-Seeking!)
    const range = req.headers.range;
    if (range) {
      const contentRange = response.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
        res.status(206); // Partial Content
      }
    }
    
    // Stream das Video durch (Node 18+ ReadableStream zu Node Stream)
    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
    
  } catch (error) {
    console.error(`💥 [Proxy] Error: ${error.message}`);
    res.status(500).json({ error: 'Proxy failed', details: error.message });
  }
});

// OPTIONS für CORS Preflight
app.options('/proxy-video', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.sendStatus(200);
});

// ============= STATE MANAGEMENT =============
const rooms = new Map();

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

// Cleanup alte Räume
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && now - room.lastActivity > 30 * 60 * 1000) {
      console.log(`🗑️ Cleanup Room: ${roomId}`);
      rooms.delete(roomId);
    }
  }
}, 60000);

// ============= 🧠 HYBRID VIDEO RESOLVER =============
const resolveTikTokUrl = async (url) => {
  console.log(`\n🔍 [Resolve] Analysiere: ${url}`);
  
  // STRATEGIE 1: TikWM API (beste Option - direkte MP4)
  try {
    const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(tikwmUrl);
    const data = await response.json();
    
    if (data?.data?.play) {
      console.log(`✅ [TikWM] MP4 gefunden!`);
      return {
        type: 'mp4',
        rawUrl: data.data.play,
        meta: {
          author: data.data.author?.unique_id,
          duration: data.data.duration
        }
      };
    } else {
      console.log(`⚠️ [TikWM] Fehlgeschlagen: ${data?.msg || 'Unknown'}`);
    }
  } catch (e) {
    console.error(`💥 [TikWM] Error: ${e.message}`);
  }
  
  // STRATEGIE 2: oEmbed API (Fallback für Metadata)
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    const data = await response.json();
    
    if (data?.html) {
      console.log(`⚠️ [oEmbed] Fallback zu Embed-Mode`);
      return {
        type: 'embed',
        rawUrl: null,
        meta: {
          title: data.title,
          author: data.author_name
        }
      };
    }
  } catch (e) {
    console.error(`💥 [oEmbed] Error: ${e.message}`);
  }
  
  // NOTFALL: Raw URL zurückgeben
  console.log(`⚠️ [Fallback] Nutze Raw Embed`);
  return { type: 'embed', rawUrl: null };
};

// ============= SOCKET.IO EVENTS =============
io.on('connection', (socket) => {
  console.log(`[Connect] Socket ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`[Disconnect] Socket ${socket.id}`);
  });
  
  socket.on('join_room', ({ roomId, userId }) => {
    if (!roomId) return;
    
    socket.join(roomId);
    const room = getRoom(roomId);
    room.users.set(userId, { socketId: socket.id });
    
    console.log(`[Join] User ${userId} -> Room ${roomId}`);
    
    socket.emit('room_state', {
      queue: room.queue,
      currentVideoIndex: room.currentVideoIndex,
      playing: room.playing,
      currentTime: room.currentTime,
      messages: room.messages
    });
  });
  
  socket.on('add_video', async ({ roomId, video }) => {
    const room = getRoom(roomId);
    if (!room) return;
    
    // 1. Als "Processing" zur Queue hinzufügen
    const tempVideo = { 
      ...video, 
      isProcessing: true, 
      mp4Url: null,
      videoType: 'unknown' 
    };
    room.queue.push(tempVideo);
    io.to(roomId).emit('update_queue', room.queue);
    
    // 2. Video-URL auflösen (TikWM oder oEmbed)
    const result = await resolveTikTokUrl(video.url);
    
    // 3. Queue mit Ergebnis updaten
    const targetIndex = room.queue.findIndex(v => v.id === video.id);
    if (targetIndex !== -1) {
      room.queue[targetIndex].isProcessing = false;
      room.queue[targetIndex].videoType = result.type;
      
      if (result.type === 'mp4' && result.rawUrl) {
        // 🔥 KRITISCHER FIX: Proxy-URL erstellen, nicht rohe URL senden!
        const proxyUrl = `http://localhost:3001/proxy-video?url=${encodeURIComponent(result.rawUrl)}`;
        room.queue[targetIndex].mp4Url = proxyUrl;
        
        console.log(`✅ [Success] Video bereit mit Proxy`);
        
        io.to(roomId).emit('system_message', {
          id: Date.now(),
          text: `✅ Video geladen! Direkter MP4-Stream aktiv.`,
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true
        });
      } else {
        // Embed-Fallback
        room.queue[targetIndex].mp4Url = null;
        
        console.log(`⚠️ [Fallback] Embed-Mode aktiviert`);
        
        io.to(roomId).emit('system_message', {
          id: Date.now(),
          text: `⚠️ Direkt-Stream nicht möglich - Nutze SYNC-Button`,
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true
        });
      }
      
      io.to(roomId).emit('update_queue', room.queue);
      
      // Auto-Play wenn erstes Video
      if (room.queue.length === 1 && result.type === 'mp4') {
        room.currentVideoIndex = 0;
        room.playing = true;
        io.to(roomId).emit('update_index', 0);
        io.to(roomId).emit('player_state', { playing: true, time: 0 });
      }
    }
  });
  
  socket.on('remove_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (room) {
      room.queue.splice(index, 1);
      if (room.currentVideoIndex >= room.queue.length) {
        room.currentVideoIndex = Math.max(0, room.queue.length - 1);
      }
      io.to(roomId).emit('update_queue', room.queue);
    }
  });
  
  socket.on('change_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (room) {
      room.currentVideoIndex = index;
      room.playing = true;
      room.currentTime = 0;
      io.to(roomId).emit('update_index', index);
      io.to(roomId).emit('player_state', { playing: true, time: 0 });
    }
  });
  
  socket.on('player_play', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (room) {
      room.playing = true;
      room.currentTime = time;
      socket.to(roomId).emit('player_state', { playing: true, time });
    }
  });
  
  socket.on('player_pause', ({ roomId, time }) => {
    const room = getRoom(roomId);
    if (room) {
      room.playing = false;
      room.currentTime = time;
      socket.to(roomId).emit('player_state', { playing: false, time });
    }
  });
  
  socket.on('player_seek', ({ roomId, time }) => {
    socket.to(roomId).emit('player_seek', time);
  });
  
  socket.on('request_countdown', ({ roomId }) => {
    console.log(`[Countdown] Room ${roomId}`);
    io.to(roomId).emit('start_countdown', 3);
  });
  
  socket.on('send_message', ({ roomId, message }) => {
    const room = getRoom(roomId);
    if (room) {
      room.messages.push(message);
      if (room.messages.length > 50) room.messages.shift();
      io.to(roomId).emit('new_message', message);
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 HYBRID SERVER LÄUFT AUF PORT ${PORT}`);
  console.log(`   --> Proxy Endpoint: /proxy-video`);
  console.log(`   --> TikWM API + oEmbed Fallback`);
  console.log(`   --> CORS-Problem gelöst! ✅\n`);
});
