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

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// State Management
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

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && now - room.lastActivity > 30 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 60000);

// ============= API HELPER =============
const resolveTikTokUrl = async (url) => {
  try {
    console.log(`\n🔍 [Resolve] Prüfe: ${url}`);

    // TikWM API Request
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (data && data.data && data.data.play) {
      const mp4Url = data.data.play;
      console.log(`✅ [Success] MP4 gefunden: ${mp4Url.substring(0, 50)}...`);
      return mp4Url;
    } else {
      console.log('❌ [Error] API Antwort:', JSON.stringify(data).substring(0, 100));
      return null;
    }
  } catch (error) {
    console.error(`💥 [Critical] Fetch Error: ${error.message}`);
    return null;
  }
};

// ============= SOCKETS =============
io.on('connection', (socket) => {
  console.log(`[Connect] Socket ${socket.id} verbunden`);

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

    // 1. Als "Processing" hinzufügen
    const tempVideo = { ...video, isProcessing: true, mp4Url: null };
    room.queue.push(tempVideo);
    io.to(roomId).emit('update_queue', room.queue);

    // 2. URL auflösen
    const mp4Url = await resolveTikTokUrl(video.url);

    // 3. Queue updaten
    const targetVideo = room.queue.find(v => v.id === video.id);
    if (targetVideo) {
      targetVideo.isProcessing = false;
      targetVideo.mp4Url = mp4Url; // Kann null sein, Frontend zeigt dann Error
      io.to(roomId).emit('update_queue', room.queue);

      // Auto-Play wenn es das erste Video ist
      if (room.queue.length === 1 && mp4Url) {
        room.currentVideoIndex = 0;
        room.playing = true;
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
  console.log(`\n🚀 SERVER LÄUFT AUF PORT ${PORT}`);
  console.log(`   Warte auf Verbindungen...\n`);
});