import { io } from 'socket.io-client';

async function testRelay() {
    console.log('Testing Streaming Relay...');

    // Client 1: Streamer
    const streamer = io('http://localhost:3001');
    const roomId = 'test-room-' + Date.now();

    // Client 2: Viewer
    const viewer = io('http://localhost:3001');

    const done = new Promise((resolve) => {
        viewer.on('stream_frame', (data) => {
            console.log('✅ Viewer received frame:', data.timestamp);
            if (data.frameData === 'mock-frame-data') {
                console.log('✅ Frame data integrity check passed');
                resolve();
            }
        });
    });

    // 1. Join Viewer
    viewer.emit('join_room', { roomId, isExtension: false });

    // 2. Join Streamer
    streamer.emit('join_room', { roomId, isExtension: true, isStreamer: true });

    // Wait for connection
    setTimeout(() => {
        // 3. Send Frame
        console.log('📤 Streamer sending frame...');
        streamer.emit('stream_frame', {
            roomId,
            frameData: 'mock-frame-data',
            timestamp: Date.now(),
            streamerId: streamer.id
        });
    }, 1000);

    await done;

    streamer.close();
    viewer.close();
    console.log('Test Complete.');
    process.exit(0);
}

testRelay().catch(err => {
    console.error(err);
    process.exit(1);
});
