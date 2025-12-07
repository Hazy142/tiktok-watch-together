// TikTok Watch Together - Content Script

console.log('🚀 TikTok Watch Together Loaded');

// === UI INJECTION ===
const createOverlay = () => {
    const overlay = document.createElement('div');
    overlay.id = 'wt-overlay';

    overlay.innerHTML = `
        <div class="wt-header">
            <span class="wt-title">TikTok Party</span>
            <button id="wt-toggle-btn">_</button>
        </div>
        <div class="wt-content">
            <div class="wt-input-group">
                <input type="text" id="wt-room-id" placeholder="Room ID" />
                <button id="wt-btn-connect">Join</button>
            </div>
            <button id="wt-create-room">Create New Room</button>
            <div class="wt-status">
                <div class="wt-dot" id="wt-dot"></div>
                <span id="wt-status-text">Disconnected</span>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Event Listeners
    document.getElementById('wt-toggle-btn').onclick = () => {
        overlay.classList.toggle('minimized');
    };

    overlay.onclick = (e) => {
        if (overlay.classList.contains('minimized')) {
            overlay.classList.remove('minimized');
        }
    };

    document.getElementById('wt-btn-connect').onclick = () => {
        const roomId = document.getElementById('wt-room-id').value;
        if (roomId) joinRoom(roomId);
    };

    document.getElementById('wt-create-room').onclick = () => {
        const newRoom = 'room-' + Math.floor(Math.random() * 10000);
        document.getElementById('wt-room-id').value = newRoom;
        joinRoom(newRoom);
    };
};

createOverlay();

// === LOGIC ===
let socket = null;
let currentRoom = null;
let ignoreSync = false;

const joinRoom = (roomId) => {
    if (socket) socket.disconnect();

    // Use localhost signaling server
    socket = io('http://localhost:3001');

    socket.on('connect', () => {
        console.log('✅ Connected to Signaling Server');
        document.getElementById('wt-dot').classList.add('connected');
        document.getElementById('wt-status-text').innerText = 'Connected: ' + roomId;
        document.getElementById('wt-btn-connect').innerText = 'Joined';

        socket.emit('join_room', roomId);
        currentRoom = roomId;
    });

    socket.on('player_state', (data) => {
        console.log('📩 Remote update:', data);
        handleRemoteEvent(data);
    });
};

// === VIDEO SYNC ===
const findVideo = () => document.querySelector('video');

const handleRemoteEvent = (data) => {
    const video = findVideo();
    if (!video) return;

    ignoreSync = true; // Prevent loop

    const { state, currentTime } = data;

    // Sync time if diff > 0.5s
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
        video.currentTime = currentTime;
    }

    if (state === 'playing') {
        video.play().catch(e => console.log('Autoplay blocked:', e));
    } else if (state === 'paused') {
        video.pause();
    }

    // Reset flag after small delay
    setTimeout(() => { ignoreSync = false; }, 300);
};

// Local Event Listeners
setInterval(() => {
    const video = findVideo();
    if (!video || video.dataset.wtAttached) return;

    console.log('🎥 Video found! Attaching listeners...');
    video.dataset.wtAttached = 'true';

    video.addEventListener('play', () => {
        if (!ignoreSync && socket && currentRoom) {
            console.log('📤 Local Play');
            socket.emit('player_play', { roomId: currentRoom, currentTime: video.currentTime });
        }
    });

    video.addEventListener('pause', () => {
        if (!ignoreSync && socket && currentRoom) {
            console.log('📤 Local Pause');
            socket.emit('player_pause', { roomId: currentRoom, currentTime: video.currentTime });
        }
    });

    video.addEventListener('seeked', () => {
        if (!ignoreSync && socket && currentRoom) {
            console.log('📤 Local Seek');
            socket.emit('player_seek', { roomId: currentRoom, currentTime: video.currentTime });
        }
    });

}, 1000); // Check for video every second (TikTok changes videos dynamically)
