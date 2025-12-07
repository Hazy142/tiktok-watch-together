import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

// CORS Config for Extension
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins (needed for Extension content script)
        methods: ["GET", "POST"]
    }
});

app.get('/', (req, res) => {
    res.send('TikTok Watch Together Signaling Server is running 🚀');
});

io.on('connection', (socket) => {
    console.log(`[Connect] Socket ${socket.id}`);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`[Join] User ${socket.id} joined room ${roomId}`);
        socket.emit('joined', roomId);
    });

    // Relay Events
    socket.on('player_play', ({ roomId, currentTime }) => {
        // Broadcast to everyone else in the room
        socket.to(roomId).emit('player_state', { state: 'playing', currentTime });
        console.log(`[Play] Room ${roomId} @ ${currentTime}`);
    });

    socket.on('player_pause', ({ roomId, currentTime }) => {
        socket.to(roomId).emit('player_state', { state: 'paused', currentTime });
        console.log(`[Pause] Room ${roomId} @ ${currentTime}`);
    });

    socket.on('player_seek', ({ roomId, currentTime }) => {
        socket.to(roomId).emit('player_state', { state: 'seek', currentTime });
        console.log(`[Seek] Room ${roomId} @ ${currentTime}`);
    });

    socket.on('disconnect', () => {
        console.log(`[Disconnect] Socket ${socket.id}`);
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`\n📡 SIGNALING SERVER STARTED ON PORT ${PORT}`);
    console.log(`   Allows connections from: TikTok Extension`);
});
