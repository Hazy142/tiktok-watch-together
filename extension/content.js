// ============================================
// TikTok Watch Together - Content Script v3.1
// Auto-Follow Sync with MutationObserver
// ============================================

console.log('🚀 TikTok Watch Together v3.1 - Auto-Follow Mode');

// ============ GLOBAL STATE ============
let socket = null;
let currentRoom = null;
let currentUserId = null;
let isStreamer = false;
let isSyncing = false;

// Video Tracking
let lastVideoUrl = null;
let videoObserver = null;
let urlCheckInterval = null;

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
        
        <!-- MODE 2: Connected -->
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
            <h4>🎯 Auto-Follow</h4>
            <button id="wt-btn-start-sync" class="wt-btn wt-btn-danger">▶ Start Sync</button>
            <button id="wt-btn-stop-sync" class="wt-btn wt-btn-secondary" style="display: none;">⏹ Stop Sync</button>
            <p class="wt-help-text" id="wt-sync-status"></p>
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
  document.getElementById('wt-toggle-btn').addEventListener('click', () => {
    document.getElementById('wt-overlay').classList.toggle('minimized');
  });

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

  document.getElementById('wt-btn-start-sync')?.addEventListener('click', startSync);
  document.getElementById('wt-btn-stop-sync')?.addEventListener('click', stopSync);
  document.getElementById('wt-btn-disconnect')?.addEventListener('click', disconnectRoom);

  document.getElementById('wt-copy-link')?.addEventListener('click', () => {
    const link = `http://localhost:3000/?room=${currentRoom}`;
    navigator.clipboard.writeText(link).then(() => alert('✅ Room link copied!'));
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

    socket.emit('join_room', {
      roomId,
      userId: currentUserId,
      isExtension: true,
      isStreamer: true
    });
  });

  socket.on('role_assigned', (data) => {
    console.log('📝 Role assigned:', data);
    isStreamer = data.isStreamer;
    updateStreamerUI(isStreamer);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected');
    stopSync();
    updateUI('disconnected');
  });
};

const disconnectRoom = () => {
  if (socket) socket.disconnect();
  stopSync();
  updateUI('disconnected');
  currentRoom = null;
};

// ============ VIDEO URL DETECTION ============
// Get current TikTok video URL from page
const getCurrentVideoUrl = () => {
  // Method 1: Check URL path for video ID
  const urlMatch = window.location.href.match(/\/@[\w.-]+\/video\/(\d+)/);
  if (urlMatch) {
    return window.location.href.split('?')[0];  // Remove query params
  }

  // Method 2: Look for canonical link
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink?.href?.includes('/video/')) {
    return canonicalLink.href;
  }

  // Method 3: Look for share link in page
  const shareButton = document.querySelector('[data-e2e="share-icon"]');
  if (shareButton) {
    const videoContainer = shareButton.closest('[data-e2e="recommend-list-item-container"]');
    const link = videoContainer?.querySelector('a[href*="/video/"]');
    if (link) return link.href.split('?')[0];
  }

  // Method 4: Parse from For You page video elements
  const activeVideo = document.querySelector('video[src]');
  if (activeVideo) {
    // Try to find the link near the active video
    const container = activeVideo.closest('[class*="DivItemContainer"]') ||
      activeVideo.closest('[data-e2e="recommend-list-item-container"]');
    const videoLink = container?.querySelector('a[href*="/video/"]');
    if (videoLink) return videoLink.href.split('?')[0];
  }

  return null;
};

// ============ SYNC MONITORING ============
const startSync = () => {
  if (isSyncing) return;
  isSyncing = true;

  console.log('🎯 Sync started');

  // Get initial video URL
  lastVideoUrl = getCurrentVideoUrl();
  if (lastVideoUrl) {
    sendVideoSync(lastVideoUrl);
  }

  // Start URL check interval (for URL-based navigation)
  urlCheckInterval = setInterval(() => {
    const currentUrl = getCurrentVideoUrl();
    if (currentUrl && currentUrl !== lastVideoUrl) {
      console.log('📍 Video changed!', { from: lastVideoUrl, to: currentUrl });
      lastVideoUrl = currentUrl;
      sendVideoSync(currentUrl);
    }
  }, 300);  // Check every 300ms for faster detection

  // Start MutationObserver for DOM changes (for swipe/scroll)
  startVideoObserver();

  // Attach video event listeners
  attachVideoListeners();

  // Update UI
  document.getElementById('wt-btn-start-sync').style.display = 'none';
  document.getElementById('wt-btn-stop-sync').style.display = 'block';
  document.getElementById('wt-sync-status').textContent = '🟢 Syncing...';
};

const startVideoObserver = () => {
  if (videoObserver) return;

  // Observe DOM changes to detect video switches
  videoObserver = new MutationObserver((mutations) => {
    // Debounce - check after DOM settles
    clearTimeout(window._wtDebounce);
    window._wtDebounce = setTimeout(() => {
      const currentUrl = getCurrentVideoUrl();
      if (currentUrl && currentUrl !== lastVideoUrl) {
        console.log('👀 MutationObserver detected video change:', currentUrl);
        lastVideoUrl = currentUrl;
        sendVideoSync(currentUrl);
        attachVideoListeners();
      }
    }, 200);
  });

  videoObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  console.log('👀 MutationObserver started');
};

const sendVideoSync = (url) => {
  if (!socket || !currentRoom || !isStreamer || !isSyncing) return;

  socket.emit('sync_navigate', {
    roomId: currentRoom,
    url: url,
    timestamp: Date.now()
  });
  console.log('📤 Sent sync_navigate:', url);

  // Update status
  const status = document.getElementById('wt-sync-status');
  if (status) status.textContent = `🟢 Synced: ${url.slice(-20)}...`;
};

const stopSync = () => {
  isSyncing = false;

  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
    urlCheckInterval = null;
  }

  if (videoObserver) {
    videoObserver.disconnect();
    videoObserver = null;
  }

  console.log('🎯 Sync stopped');

  const startBtn = document.getElementById('wt-btn-start-sync');
  const stopBtn = document.getElementById('wt-btn-stop-sync');
  const statusText = document.getElementById('wt-sync-status');

  if (startBtn) startBtn.style.display = 'block';
  if (stopBtn) stopBtn.style.display = 'none';
  if (statusText) statusText.textContent = '⚪ Stopped';
};

// ============ VIDEO EVENT LISTENERS ============
const attachVideoListeners = () => {
  const video = document.querySelector('video');
  if (!video || video.dataset.wtAttached) return;

  video.dataset.wtAttached = 'true';
  console.log('🎥 Attached video listeners');

  video.addEventListener('play', () => {
    if (socket && currentRoom && isStreamer && isSyncing) {
      socket.emit('player_play', {
        roomId: currentRoom,
        currentTime: video.currentTime
      });
    }
  });

  video.addEventListener('pause', () => {
    if (socket && currentRoom && isStreamer && isSyncing) {
      socket.emit('player_pause', {
        roomId: currentRoom,
        currentTime: video.currentTime
      });
    }
  });

  video.addEventListener('seeked', () => {
    if (socket && currentRoom && isStreamer && isSyncing) {
      socket.emit('player_seek', {
        roomId: currentRoom,
        currentTime: video.currentTime
      });
    }
  });
};

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
  const roleDisplay = document.getElementById('wt-role-display');

  if (isStreamerRole) {
    streamerControls.style.display = 'block';
    roleDisplay.textContent = '🎬 Streamer';
  } else {
    streamerControls.style.display = 'none';
    roleDisplay.textContent = '👁️ Viewer';
  }
};

// ============ INITIALIZATION ============
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createOverlay);
} else {
  createOverlay();
}
