// TikTok Watch Together - Extension Content Script
// Handles overlay injection, socket connection, and frame capture

let socket = null;
let roomId = null;
let isStreamer = false;
let captureInterval = null;
let streamerId = null;

// Inject CSS
const link = document.createElement('link');
link.href = chrome.runtime.getURL('style.css');
link.type = 'text/css';
link.rel = 'stylesheet';
document.head.appendChild(link);

// Create Overlay UI
const overlay = document.createElement('div');
overlay.id = 'twt-overlay';
overlay.innerHTML = `
  <div class="twt-header">
    <h3>🎵 Watch Together</h3>
    <button id="twt-minimize">_</button>
  </div>
  <div class="twt-content">
    <div id="twt-setup" class="twt-step active">
      <button id="twt-create-room" class="twt-btn primary">Create New Room</button>
      <div class="twt-divider">OR</div>
      <input type="text" id="twt-room-input" placeholder="Enter Room ID">
      <button id="twt-join-room" class="twt-btn secondary">Join Room</button>
    </div>

    <div id="twt-controls" class="twt-step">
      <div class="twt-status">
        <span class="status-dot"></span>
        <span id="twt-status-text">Connected</span>
      </div>
      <div class="twt-room-info">
        <span>Room:</span>
        <code id="twt-room-id">...</code>
        <button id="twt-copy-room" title="Copy ID">📋</button>
      </div>
      <div class="twt-role-controls">
        <button id="twt-toggle-stream" class="twt-btn primary">Start Sharing</button>
        <button id="twt-leave-room" class="twt-btn danger">Leave Room</button>
      </div>
      <div class="twt-stats">
        <div>👥 <span id="twt-viewer-count">0</span></div>
        <div id="twt-stream-indicator" style="display:none">🔴 LIVE</div>
      </div>
    </div>
  </div>
`;
document.body.appendChild(overlay);

// UI Event Listeners
document.getElementById('twt-minimize').addEventListener('click', () => {
  overlay.classList.toggle('minimized');
});

document.getElementById('twt-create-room').addEventListener('click', () => {
  const newRoomId = 'room-' + Math.random().toString(36).substr(2, 9);
  connectSocket(newRoomId, true);
});

document.getElementById('twt-join-room').addEventListener('click', () => {
  const inputRoomId = document.getElementById('twt-room-input').value.trim();
  if (inputRoomId) {
    connectSocket(inputRoomId, false);
  }
});

document.getElementById('twt-copy-room').addEventListener('click', () => {
  const roomIdText = document.getElementById('twt-room-id').innerText;
  navigator.clipboard.writeText(roomIdText);
});

document.getElementById('twt-leave-room').addEventListener('click', () => {
  disconnectSocket();
  switchStep('twt-setup');
});

document.getElementById('twt-toggle-stream').addEventListener('click', () => {
  if (captureInterval) {
    stopStreaming();
  } else {
    startStreaming();
  }
});

// Socket Connection
function connectSocket(room, isCreator) {
  if (socket && socket.connected) {
      socket.disconnect();
  }

  // Connect to local signaling server
  socket = io('http://localhost:3001', {
      transports: ['websocket'],
      upgrade: false
  });

  socket.on('connect', () => {
    console.log('[TWT] Connected to server');
    roomId = room;
    isStreamer = isCreator; // Initial intent

    socket.emit('join_room', {
      roomId,
      isExtension: true,
      isStreamer: isCreator
    });

    updateRoomUI(roomId);
    switchStep('twt-controls');
    document.getElementById('twt-status-text').innerText = 'Connected';
    document.querySelector('.status-dot').style.backgroundColor = '#00f2ea';
  });

  socket.on('role_assigned', (data) => {
    console.log('[TWT] Role assigned:', data);
    isStreamer = data.isStreamer;
    streamerId = data.userId;
    updateRoleUI();
  });

  socket.on('user_joined', (data) => {
    if (data.totalUsers) {
        document.getElementById('twt-viewer-count').innerText = data.totalUsers - 1;
    }
  });

  socket.on('user_left', (data) => {
    if (data.totalUsers) {
        document.getElementById('twt-viewer-count').innerText = data.totalUsers - 1;
    }
  });

  socket.on('disconnect', () => {
    console.log('[TWT] Disconnected');
    stopStreaming();
    document.getElementById('twt-status-text').innerText = 'Disconnected';
    document.querySelector('.status-dot').style.backgroundColor = '#ff0050';
  });
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  stopStreaming();
}

// Streaming Logic
function startStreaming() {
  if (!isStreamer) return;

  const videoContainer = document.querySelector('[data-e2e="video-player-container"]');
  if (!videoContainer) {
    alert('No video found to stream! Please open a video.');
    return;
  }

  document.getElementById('twt-toggle-stream').innerText = 'Stop Sharing';
  document.getElementById('twt-toggle-stream').classList.add('danger');
  document.getElementById('twt-stream-indicator').style.display = 'block';

  // Start capture loop
  captureInterval = setInterval(() => {
    captureAndSendFrame(videoContainer);
  }, 250); // 4 FPS
}

function stopStreaming() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  if (socket && roomId) {
      socket.emit('stream_stopped', { roomId });
  }

  document.getElementById('twt-toggle-stream').innerText = 'Start Sharing';
  document.getElementById('twt-toggle-stream').classList.remove('danger');
  document.getElementById('twt-stream-indicator').style.display = 'none';
}

function captureAndSendFrame(container) {
  if (!socket || !socket.connected) return;

  // html2canvas should now be available from manifest injection
  if (typeof html2canvas === 'undefined') {
      console.error('[TWT] html2canvas not found!');
      return;
  }

  html2canvas(container, {
      scale: 0.5,
      useCORS: true,
      allowTaint: true,
      logging: false
  }).then(canvas => {
      const frameData = canvas.toDataURL('image/jpeg', 0.6);
      socket.emit('stream_frame', {
          roomId,
          frameData,
          timestamp: Date.now(),
          streamerId
      });
  }).catch(err => {
      console.error('[TWT] Capture error:', err);
  });
}

// Helper Functions
function switchStep(stepId) {
  document.querySelectorAll('.twt-step').forEach(el => el.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

function updateRoomUI(id) {
  document.getElementById('twt-room-id').innerText = id;
}

function updateRoleUI() {
  const streamBtn = document.getElementById('twt-toggle-stream');
  if (isStreamer) {
    streamBtn.style.display = 'block';
  } else {
    streamBtn.style.display = 'none';
  }
}
