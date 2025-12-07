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

// ============= 🛡️ VIDEO PROXY (CORS KILLER) =============
// Dein Server holt das Video und reicht es weiter.
// Browser denkt: "Ah, kommt von localhost, das darf ich abspielen!"
app.get('/proxy-video', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('No URL provided');

  try {
    // Wir tun so, als wären wir ein normaler Browser
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
      }
    });

    if (!response.ok) throw new Error(`Proxy fetch failed: ${response.status}`);

    // Wir setzen permissive Header für dein Frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');

    // Pipe den Stream direkt durch
    // Node 18+ native fetch body ist ein ReadableStream, wir müssen ihn in einen Node Stream wandeln
    const reader = response.body.getReader();
    const stream = new ReadableStream({
      start(controller) {
        return pump();
        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            return pump();
          });
        }
      }
    });

    // Für Node < 20 (und sicherheitshalber): ArrayBuffer chunking
    // Einfacherer Weg für Node Stream Response:
    const nodeStream = require('stream').Readable.fromWeb(response.body);
    nodeStream.pipe(res);

  } catch (error) {
    console.error('[Proxy Error]', error.message);
    res.status(500).send('Proxy Error');
  }
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

// Cleanup Loop
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && now - room.lastActivity > 30 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 60000);

// ============= 🧠 HYBRID RESOLVER =============
const resolveTikTokUrl = async (url) => {
  console.log(`\n🔍 [Resolve] Starte Hybrid-Analyse für: ${url}`);

  // STRATEGIE 1: TikWM API (für perfekte MP4s)
  try {
    const tikwmUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(tikwmUrl);
    const data = await response.json();

    if (data?.data?.play) {
      console.log(`✅ [Strategy 1] TikWM MP4 gefunden!`);
      return {
        type: 'mp4',
        url: data.data.play, // Die direkte MP4 URL
        meta: data.data
      };
    }
  } catch (e) {
    console.log(`⚠️ [Strategy 1] TikWM failed: ${e.message}`);
  }

  // STRATEGIE 2: oEmbed (Fallback für Embed Player)
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);
    const data = await response.json();

    if (data?.html) {
      console.log(`Vk [Strategy 2] oEmbed Daten gefunden - Nutze Fallback Player`);
      return {
        type: 'embed',
        url: url, // Original URL für das Embed
        meta: data
      };
    }
  } catch (e) {
    console.log(`⚠️ [Strategy 2] oEmbed failed: ${e.message}`);
  }

  // NOTFALL: Einfach Original-URL zurückgeben
  console.log(`⚠️ [Strategy 3] Giving up - return raw URL`);
  return { type: 'embed', url: url };
};

// ============= SOCKETS =============
io.on('connection', (socket) => {
  console.log(`[Connect] Socket ${socket.id}`);

  socket.on('join_room', ({ roomId, userId }) => {
    if (!roomId) return;
    socket.join(roomId);
    const room = getRoom(roomId);
    room.users.set(userId, { socketId: socket.id });

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

    // 1. Processing Marker
    const tempVideo = { ...video, isProcessing: true, mp4Url: null, videoType: 'unknown' };
    room.queue.push(tempVideo);
    io.to(roomId).emit('update_queue', room.queue);

    // 2. Resolve
    const result = await resolveTikTokUrl(video.url);

    // 3. Update Queue
    const targetVideo = room.queue.find(v => v.id === video.id);
    if (targetVideo) {
      targetVideo.isProcessing = false;
      targetVideo.videoType = result.type; // 'mp4' oder 'embed'

      if (result.type === 'mp4') {
        // HIER DER TRICK: Wir speichern die Proxy-URL, nicht die echte!
        // Wir gehen davon aus, dass der Server auf Port 3001 läuft (localhost für dev)
        // In Production müsste hier die echte Domain stehen.
        // Für den Moment senden wir die rohe URL und lassen das Frontend den Proxy bauen
        // oder wir bauen es hier:
        targetVideo.mp4Url = result.url;
      } else {
        targetVideo.mp4Url = null;
      }

      io.to(roomId).emit('update_queue', room.queue);

      // Auto-Play
      if (room.queue.length === 1) {
        room.currentVideoIndex = 0;
        room.playing = true;
        io.to(roomId).emit('player_state', { playing: true, time: 0 });
      }
    }
  });

  // Standard Sync Events...
  socket.on('remove_video', ({ roomId, index }) => {
    const room = getRoom(roomId);
    if (room) {
      room.queue.splice(index, 1);
      if (room.currentVideoIndex >= room.queue.length) room.currentVideoIndex = Math.max(0, room.queue.length - 1);
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
  console.log(`   --> Proxy Endpoint aktiv: /proxy-video`);
});