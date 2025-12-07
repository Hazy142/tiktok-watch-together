import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

// ============ SOCKET.IO CONFIG ============
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ============ IN-MEMORY ROOM STATE ============
const rooms = new Map();

const getRoomState = (roomId) => {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            streamer: null,
            viewers: new Set(),
            currentUrl: null,  // NEW: Track current TikTok URL
            createdAt: Date.now(),
            lastActivity: Date.now()
        });
    }
    return rooms.get(roomId);
};

// ============ HTTP ENDPOINTS ============
app.get('/', (req, res) => {
    res.send('🚀 TikTok Watch Together Signaling Server v3.0 (Auto-Follow Sync)');
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        uptime: process.uptime()
    });
});

// ============ SOCKET.IO EVENT HANDLERS ============
io.on('connection', (socket) => {
    console.log(`[✅ Connect] Socket ${socket.id}`);

    // ========== ROOM MANAGEMENT ==========
    socket.on('join_room', (data) => {
        const { roomId, userId, isExtension, isStreamer } = data;

        socket.join(roomId);
        const room = getRoomState(roomId);
        room.lastActivity = Date.now();

        console.log(`[📍 Join] User ${userId} joined room ${roomId} (Extension: ${isExtension}, Streamer: ${isStreamer})`);

        // Assign streamer role
        let actualStreamer = isStreamer && !room.streamer;  // First one to join is streamer

        if (actualStreamer) {
            room.streamer = userId;
            console.log(`[🎬 Streamer] ${userId} is now streaming in room ${roomId}`);
        } else {
            room.viewers.add(userId);
        }

        // Notify user of role assignment
        socket.emit('role_assigned', {
            isStreamer: actualStreamer,
            roomId,
            userId,
            streamerName: actualStreamer ? 'You' : room.streamer || 'Unknown',
            totalViewers: room.viewers.size
        });

        // Notify room about new user
        socket.to(roomId).emit('user_joined', {
            userId,
            userName: userId,
            isStreamer: actualStreamer,
            totalUsers: 1 + room.viewers.size
        });

        // Send room info to all
        io.to(roomId).emit('room_info', {
            roomId,
            streamer: room.streamer,
            viewers: Array.from(room.viewers),
            userCount: 1 + room.viewers.size
        });
    });

    // ========== AUTO-FOLLOW SYNC (URL-BASED) ==========
    socket.on('sync_navigate', (data) => {
        const { roomId, url, timestamp } = data;
        const room = getRoomState(roomId);

        // Store current URL in room state
        room.currentUrl = url;
        room.lastActivity = Date.now();

        console.log(`[🔄 Sync Navigate] Room ${roomId} -> ${url}`);

        // Broadcast change_video to all viewers (except streamer)
        socket.to(roomId).emit('change_video', {
            url,
            timestamp,
            message: 'Streamer navigated to new video'
        });
    });

    // ========== PLAYER CONTROLS (Streamer → Viewers) ==========
    socket.on('player_play', (data) => {
        const { roomId, currentTime } = data;
        socket.to(roomId).emit('player_play', {
            currentTime,
            timestamp: Date.now()
        });
        console.log(`[▶️ Play] Room ${roomId} @ ${currentTime}s`);
    });

    socket.on('player_pause', (data) => {
        const { roomId, currentTime } = data;
        socket.to(roomId).emit('player_pause', {
            currentTime,
            timestamp: Date.now()
        });
        console.log(`[⏸️ Pause] Room ${roomId} @ ${currentTime}s`);
    });

    socket.on('player_seek', (data) => {
        const { roomId, currentTime } = data;
        socket.to(roomId).emit('player_seek', {
            currentTime,
            timestamp: Date.now()
        });
        console.log(`[⏩ Seek] Room ${roomId} @ ${currentTime}s`);
    });

    // ========== CHAT & MESSAGING ==========
    socket.on('send_message', (data) => {
        const { roomId, message, userId } = data;

        io.to(roomId).emit('new_message', {
            ...message,
            userId
        });
        console.log(`[💬 Message] ${userId}: ${message.text}`);
    });

    socket.on('request_countdown', (data) => {
        const { roomId } = data;
        console.log(`[⏱️ Countdown] Requested in room ${roomId}`);

        let count = 3;
        io.to(roomId).emit('start_countdown', count);

        const countdown = setInterval(() => {
            count--;
            if (count >= 0) {
                io.to(roomId).emit('start_countdown', count);
            } else {
                clearInterval(countdown);
            }
        }, 1000);
    });

    // ========== SYNC STATE EXCHANGE ==========
    socket.on('request_room_state', (data) => {
        const { roomId } = data;
        const room = getRoomState(roomId);

        socket.emit('room_state', {
            roomId,
            streamer: room.streamer,
            viewers: Array.from(room.viewers),
            userCount: 1 + room.viewers.size,
            createdAt: room.createdAt
        });
    });

    // ========== DISCONNECTION ==========
    socket.on('disconnect', () => {
        console.log(`[❌ Disconnect] Socket ${socket.id}`);

        // Find and clean up user from rooms
        for (const [roomId, room] of rooms.entries()) {
            if (room.streamer === socket.id) {
                console.log(`[🎬 Streamer Left] ${socket.id} left room ${roomId}`);
                room.streamer = null;
                io.to(roomId).emit('streamer_left', {
                    message: 'Streamer disconnected'
                });
            } else if (room.viewers.has(socket.id)) {
                room.viewers.delete(socket.id);
                console.log(`[👁️ Viewer Left] ${socket.id} left room ${roomId}`);
            }
        }
    });
});

// ============ ROOM CLEANUP ============
setInterval(() => {
    const timeout = 30 * 60 * 1000;  // 30 minutes

    for (const [roomId, room] of rooms.entries()) {
        if (room.streamer === null &&
            room.viewers.size === 0 &&
            Date.now() - room.lastActivity > timeout) {
            rooms.delete(roomId);
            console.log(`[🗑️ Cleanup] Deleted inactive room ${roomId}`);
        }
    }
}, 30 * 60 * 1000);

// ============ SERVER STARTUP ============
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`
📡 SIGNALING SERVER STARTED`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Features: Screen Share, Room Management, Player Sync`);
    console.log(`   Health Check: GET http://localhost:${PORT}/health\n`);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    httpServer.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});
