// ============================================
// TikTok Watch Together - Content Script v2.0
// Screen Share Enabled Extension
// ============================================

console.log('🚀 TikTok Watch Together v2.0 Loaded');

// ============ GLOBAL STATE ============
let socket = null;
let currentRoom = null;
let currentUserId = null;
let isStreamer = false;  // NEW: Track if this user is streaming
let ignoreSync = false;
let screenCaptureActive = false;
let captureInterval = null;

// ============ UI CREATION ============
const createOverlay = () => {
  const overlay = document.createElement('div');
  overlay.id = 'wt-overlay';
  overlay.innerHTML = `
    <div class="wt-container">
      <div class="wt-header">
        <span class="wt-title">🎬 TikTok Party</span>
        <button id="wt-toggle-btn" class="wt-btn-minimize">▼</button>
      </div>
      
      <div class="wt-content" id="wt-content">
        <!-- MODE 1: Not Connected -->
        <div id="wt-mode-connect" class="wt-mode">
          <div class="wt-input-group">
            <input type="text" id="wt-room-id" placeholder="Room ID" class="wt-input" />
            <button id="wt-btn-connect" class="wt-btn wt-btn-primary">Join Room</button>
          </div>
          <button id="wt-create-room" class="wt-btn wt-btn-secondary">Create New Room</button>
        </div>
        
        <!-- MODE 2: Connected & Options -->
        <div id="wt-mode-connected" class="wt-mode" style="display: none;">
          <div class="wt-room-info">
            <div class="wt-status-item">
              <span class="wt-label">Room:</span>
              <span id="wt-room-display" class="wt-value">-</span>
              <button id="wt-copy-link" class="wt-btn-icon" title="Copy room link">📋</button>
            </div>
            <div class="wt-status-item">
              <span class="wt-label">Role:</span>
              <span id="wt-role-display" class="wt-value">Viewer</span>
            </div>
          </div>
          
          <!-- Streamer Controls -->
          <div id="wt-streamer-controls" style="display: none;">
            <h4>🎥 Streamer Controls</h4>
            <button id="wt-btn-start-capture" class="wt-btn wt-btn-danger">▶ Start Screen Share</button>
            <button id="wt-btn-stop-capture" class="wt-btn wt-btn-secondary" style="display: none;">⏹ Stop Screen Share</button>
            <p class="wt-help-text" id="wt-capture-status"></p>
          </div>
          
          <!-- Viewer Info -->
          <div id="wt-viewer-info" style="display: none;">
            <p class="wt-info-text">⏳ Waiting for streamer...</p>
            <p class="wt-help-text">Current Streamer: <span id="wt-current-streamer">-</span></p>
          </div>
          
          <!-- Connection Status -->
          <div class="wt-status-bar">
            <div class="wt-dot" id="wt-dot"></div>
            <span id="wt-status-text">Connecting...</span>
          </div>
          
          <button id="wt-btn-disconnect" class="wt-btn wt-btn-danger-outline">🚪 Leave Room</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  attachEventListeners();
};

// ============ EVENT LISTENERS ============
const attachEventListeners = () => {
  // Toggle overlay
  document.getElementById('wt-toggle-btn').addEventListener('click', () => {
    const content = document.getElementById('wt-content');
    const overlay = document.getElementById('wt-overlay');
    overlay.classList.toggle('minimized');
  });
  
  // Connection mode
  document.getElementById('wt-btn-connect').addEventListener('click', () => {
    const roomId = document.getElementById('wt-room-id').value.trim();
    if (roomId) joinRoom(roomId);
    else alert('Please enter a Room ID');
  });
  
  document.getElementById('wt-create-room').addEventListener('click', () => {
    const newRoom = 'room-' + Math.random().toString(36).substr(2, 9);
    document.getElementById('wt-room-id').value = newRoom;
    joinRoom(newRoom);
  });
  
  // Streamer controls
  document.getElementById('wt-btn-start-capture')?.addEventListener('click', startScreenCapture);
  document.getElementById('wt-btn-stop-capture')?.addEventListener('click', stopScreenCapture);
  
  // Disconnect
  document.getElementById('wt-btn-disconnect')?.addEventListener('click', disconnectRoom);
  
  // Copy room link
  document.getElementById('wt-copy-link')?.addEventListener('click', () => {
    const link = `http://localhost:5173/?room=${currentRoom}`;
    navigator.clipboard.writeText(link).then(() => {
      alert('✅ Room link copied!');
    });
  });
};

// ============ ROOM CONNECTION ============
const joinRoom = (roomId) => {
  if (socket) socket.disconnect();
  
  socket = io('http://localhost:3001');
  currentRoom = roomId;
  currentUserId = 'ext-' + Math.random().toString(36).substr(2, 9);
  
  socket.on('connect', () => {
    console.log('✅ Connected to server');
    updateUI('connected', roomId);
    
    // Emit join with extension marker
    socket.emit('join_room', {
      roomId,
      userId: currentUserId,
      isExtension: true,
      isStreamer: true  // Extension user defaults to streamer
    });
  });
  
  // Receive role assignment
  socket.on('role_assigned', (data) => {
    console.log('📝 Role assigned:', data);
    isStreamer = data.isStreamer;
    updateStreamerUI(isStreamer);
    
    if (!isStreamer) {
      document.getElementById('wt-current-streamer').textContent = data.streamerName || 'Unknown';
    }
  });
  
  // Receive sync commands from other extension
  socket.on('player_state', (data) => {
    handleRemoteSync(data);
  });
  
  // Receive video player commands
  socket.on('player_play', () => {
    if (isStreamer) playCurrentVideo();
  });
  
  socket.on('player_pause', () => {
    if (isStreamer) pauseCurrentVideo();
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Disconnected');
    screenCaptureActive = false;
    stopScreenCapture();
    updateUI('disconnected');
  });
};

const disconnectRoom = () => {
  if (socket) socket.disconnect();
  screenCaptureActive = false;
  stopScreenCapture();
  updateUI('disconnected');
  currentRoom = null;
};

// ============ SCREEN CAPTURE (STREAMER) ============
const startScreenCapture = async () => {
  if (screenCaptureActive) return;
  
  try {
    console.log('📹 Starting screen capture...');
    screenCaptureActive = true;
    
    document.getElementById('wt-btn-start-capture').style.display = 'none';
    document.getElementById('wt-btn-stop-capture').style.display = 'block';
    document.getElementById('wt-capture-status').textContent = '🟢 Streaming...';
    
    // Capture frames every 250ms (~4 FPS)
    captureInterval = setInterval(captureAndSendFrame, 250);
    
  } catch (error) {
    console.error('❌ Screen capture error:', error);
    document.getElementById('wt-capture-status').textContent = '❌ Error: ' + error.message;
    screenCaptureActive = false;
  }
};

const stopScreenCapture = () => {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  
  screenCaptureActive = false;
  document.getElementById('wt-btn-start-capture').style.display = 'block';
  document.getElementById('wt-btn-stop-capture').style.display = 'none';
  document.getElementById('wt-capture-status').textContent = '⚪ Stopped';
  
  // Notify server
  if (socket) {
    socket.emit('stream_stopped', { roomId: currentRoom });
  }
};

const captureAndSendFrame = () => {
  try {
    // Capture main TikTok video container
    const videoContainer = document.querySelector('[data-e2e="video-player-container"]') ||
                          document.querySelector('.tiktok-1j4l1fu-VideoContainer') ||
                          document.querySelector('video')?.parentElement;
    
    if (!videoContainer) {
      console.warn('⚠️ Video container not found');
      return;
    }
    
    // Use html2canvas for accurate rendering
    html2canvas(videoContainer, {
      allowTaint: true,
      useCORS: true,
      scale: 0.5  // Reduce quality for bandwidth
    }).then((canvas) => {
      const frameData = canvas.toDataURL('image/jpeg', 0.6);  // Compress
      
      // Send to server
      if (socket && currentRoom) {
        socket.emit('stream_frame', {
          roomId: currentRoom,
          frameData,
          timestamp: Date.now(),
          streamerId: currentUserId
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Frame capture error:', error);
  }
};

// ============ VIDEO CONTROL (STREAMER) ============
const playCurrentVideo = () => {
  const video = findVideo();
  if (video && video.paused) {
    video.play().catch(e => console.log('Auto-play blocked:', e));
  }
};

const pauseCurrentVideo = () => {
  const video = findVideo();
  if (video && !video.paused) {
    video.pause();
  }
};

const findVideo = () => document.querySelector('video');

// ============ SYNC HANDLING ============
const handleRemoteSync = (data) => {
  if (isStreamer) return;  // Only viewers receive sync
  
  // Viewers see the stream frame
  console.log('📩 Sync received:', data);
};

// Monitor local TikTok video for changes
setInterval(() => {
  if (!isStreamer) return;  // Only streamer needs to monitor
  
  const video = findVideo();
  if (!video || video.dataset.wtAttached) return;
  
  console.log('🎥 TikTok video detected, monitoring...');
  video.dataset.wtAttached = 'true';
  
  // Send play/pause events to other extensions or webapp
  video.addEventListener('play', () => {
    if (socket && currentRoom && isStreamer) {
      socket.emit('player_play', { roomId: currentRoom });
    }
  });
  
  video.addEventListener('pause', () => {
    if (socket && currentRoom && isStreamer) {
      socket.emit('player_pause', { roomId: currentRoom });
    }
  });
  
}, 1000);

// ============ UI UPDATES ============
const updateUI = (state, roomId = null) => {
  const connectMode = document.getElementById('wt-mode-connect');
  const connectedMode = document.getElementById('wt-mode-connected');
  
  if (state === 'connected') {
    connectMode.style.display = 'none';
    connectedMode.style.display = 'block';
    document.getElementById('wt-room-display').textContent = roomId;
    document.getElementById('wt-dot').classList.add('connected');
    document.getElementById('wt-status-text').textContent = '🟢 Connected';
  } else {
    connectMode.style.display = 'block';
    connectedMode.style.display = 'none';
    document.getElementById('wt-dot').classList.remove('connected');
    document.getElementById('wt-status-text').textContent = '⚪ Disconnected';
  }
};

const updateStreamerUI = (isStreamerRole) => {
  const streamerControls = document.getElementById('wt-streamer-controls');
  const viewerInfo = document.getElementById('wt-viewer-info');
  const roleDisplay = document.getElementById('wt-role-display');
  
  if (isStreamerRole) {
    streamerControls.style.display = 'block';
    viewerInfo.style.display = 'none';
    roleDisplay.textContent = '🎬 Streamer';
  } else {
    streamerControls.style.display = 'none';
    viewerInfo.style.display = 'block';
    roleDisplay.textContent = '👁️ Viewer';
  }
};

// ============ INITIALIZATION ============
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createOverlay);
} else {
  createOverlay();
}
