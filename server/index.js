import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Store current video per room
const rooms = new Map();

app.get('/', (req, res) => res.send('TikTok Watch Together v4'));
app.get('/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on('join_room', ({ roomId }) => {
        socket.join(roomId);
        console.log(`[Room] ${socket.id} joined ${roomId}`);

        // Send current video if exists
        if (rooms.has(roomId)) {
            socket.emit('sync_video', rooms.get(roomId));
        }
    });

    socket.on('sync_video', ({ roomId, url }) => {
        console.log(`[Sync] Room ${roomId} -> ${url}`);
        rooms.set(roomId, { url, timestamp: Date.now() });

        // Broadcast to all in room (except sender)
        socket.to(roomId).emit('sync_video', { url, timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
