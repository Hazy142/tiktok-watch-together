import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Store room state
// Map<roomId, {
//   currentVideo: { url, timestamp },
//   users: Map<socketId, { isStreamer, userId, ... }>
// }>
const rooms = new Map();

app.get('/', (req, res) => res.send('TikTok Watch Together v4'));
app.get('/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on('join_room', ({ roomId, userId, isExtension, isStreamer }) => {
        socket.join(roomId);

        // Initialize room if needed
        if (!rooms.has(roomId)) {
            rooms.set(roomId, {
                currentVideo: null,
                users: new Map()
            });
        }

        const room = rooms.get(roomId);

        // Register user
        const userData = {
            id: socket.id,
            userId: userId || socket.id,
            isExtension: !!isExtension,
            isStreamer: !!isStreamer
        };
        room.users.set(socket.id, userData);

        console.log(`[Room] ${socket.id} joined ${roomId} (Streamer: ${isStreamer})`);

        // Notify user of their role
        socket.emit('role_assigned', {
            isStreamer: !!isStreamer,
            roomId,
            userId: userData.userId,
            totalViewers: room.users.size
        });

        // Notify others
        socket.to(roomId).emit('user_joined', {
            userId: userData.userId,
            isStreamer: !!isStreamer,
            totalUsers: room.users.size
        });

        // Send current video if exists (for non-streamers)
        if (room.currentVideo) {
            socket.emit('sync_video', room.currentVideo);
        }
    });

    // --- Streaming Events ---

    socket.on('stream_frame', (data) => {
        const { roomId, frameData, timestamp, streamerId } = data;
        // Relay to everyone else in the room
        // Volatile means it can be dropped if network is slow (good for streaming)
        socket.to(roomId).volatile.emit('stream_frame', {
            frameData,
            timestamp,
            streamerId
        });
    });

    socket.on('stream_stopped', ({ roomId }) => {
        console.log(`[Stream] Stopped in ${roomId}`);
        socket.to(roomId).emit('stream_stopped', {
            message: 'Streamer stopped sharing'
        });
    });

    // --- Video Sync Events (Legacy/Playlist) ---

    socket.on('sync_video', ({ roomId, url }) => {
        console.log(`[Sync] Room ${roomId} -> ${url}`);

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.currentVideo = { url, timestamp: Date.now() };
        }

        socket.to(roomId).emit('sync_video', { url, timestamp: Date.now() });
    });

    // --- Chat Events ---

    socket.on('chat_message', ({ roomId, message }) => {
        // Relay chat message
        socket.to(roomId).emit('chat_message', message);
    });

    // --- Playlist Events ---

    socket.on('playlist_add', ({ roomId, video }) => {
        socket.to(roomId).emit('playlist_add', video);
    });

    // --- Disconnect ---

    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);

        // Cleanup user from rooms
        rooms.forEach((room, roomId) => {
            if (room.users.has(socket.id)) {
                const user = room.users.get(socket.id);
                room.users.delete(socket.id);

                // Notify room
                io.to(roomId).emit('user_left', {
                    userId: user.userId,
                    totalUsers: room.users.size
                });

                if (user.isStreamer) {
                    console.log(`[Stream] Streamer left ${roomId}`);
                    io.to(roomId).emit('streamer_left', {
                        message: 'Streamer disconnected'
                    });
                }

                // Cleanup empty room
                if (room.users.size === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
