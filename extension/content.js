// TikTok Watch Together Extension v4
// Minimal: Just detect video changes and sync

console.log('🎬 TikTok Watch Together v4 loaded');

let socket = null;
let roomId = null;
let lastVideoUrl = null;
let observer = null;

// Create simple UI
const createUI = () => {
  const ui = document.createElement('div');
  ui.id = 'wt-ui';
  ui.innerHTML = `
    <style>
      #wt-ui {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0,0,0,0.9);
        border: 2px solid #00f2ea;
        border-radius: 12px;
        padding: 16px;
        z-index: 99999;
        font-family: -apple-system, sans-serif;
        color: white;
        min-width: 200px;
      }
      #wt-ui h3 { margin: 0 0 12px 0; color: #00f2ea; font-size: 14px; }
      #wt-ui input { 
        width: 100%; padding: 8px; margin-bottom: 8px; 
        border: 1px solid #333; border-radius: 6px; 
        background: #111; color: white; 
      }
      #wt-ui button { 
        width: 100%; padding: 10px; border: none; border-radius: 6px; 
        background: #00f2ea; color: black; font-weight: bold; cursor: pointer; 
        margin-bottom: 6px;
      }
      #wt-ui button:hover { background: #00d4ce; }
      #wt-ui .status { font-size: 11px; color: #888; margin-top: 8px; }
      #wt-ui .connected { color: #00f2ea; }
    </style>
    <h3>🎬 TikTok Party</h3>
    <input id="wt-room" placeholder="Room ID" value="party-${Date.now().toString(36)}">
    <button id="wt-connect">Start Streaming</button>
    <div class="status" id="wt-status">Not connected</div>
  `;
  document.body.appendChild(ui);

  document.getElementById('wt-connect').onclick = connect;
};

// Connect to server
const connect = () => {
  roomId = document.getElementById('wt-room').value;
  if (!roomId) return alert('Enter a room ID');

  socket = io('http://localhost:3001');

  socket.on('connect', () => {
    socket.emit('join_room', { roomId });
    document.getElementById('wt-status').textContent = '🟢 Connected - ' + roomId;
    document.getElementById('wt-status').className = 'status connected';
    document.getElementById('wt-connect').textContent = 'Streaming...';
    document.getElementById('wt-connect').disabled = true;

    // Start watching for video changes
    startWatching();
  });

  socket.on('disconnect', () => {
    document.getElementById('wt-status').textContent = '🔴 Disconnected';
    document.getElementById('wt-status').className = 'status';
  });
};

// Watch for video changes
const startWatching = () => {
  // Initial sync
  syncCurrentVideo();

  // Watch DOM for changes (TikTok is SPA, URL doesn't always change)
  observer = new MutationObserver(() => {
    syncCurrentVideo();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Also check periodically as backup
  setInterval(syncCurrentVideo, 500);
};

// Get current video URL from DOM
const getCurrentVideoUrl = () => {
  // Method 1: Check visible video container
  const containers = document.querySelectorAll('[data-e2e="recommend-list-item-container"]');
  for (const container of containers) {
    const rect = container.getBoundingClientRect();
    // Check if container is mostly visible
    if (rect.top >= -100 && rect.top <= window.innerHeight / 2) {
      const link = container.querySelector('a[href*="/video/"]');
      if (link) return link.href.split('?')[0];
    }
  }

  // Method 2: Check for single video page
  const match = window.location.href.match(/\/@[\w.-]+\/video\/(\d+)/);
  if (match) return window.location.href.split('?')[0];

  // Method 3: Find any video link near active video element
  const video = document.querySelector('video');
  if (video) {
    const parent = video.closest('[class*="Container"]');
    if (parent) {
      const link = parent.querySelector('a[href*="/video/"]');
      if (link) return link.href.split('?')[0];
    }
  }

  return null;
};

// Sync current video to server
const syncCurrentVideo = () => {
  const url = getCurrentVideoUrl();

  if (url && url !== lastVideoUrl && url.includes('/video/')) {
    console.log('📤 New video detected:', url);
    lastVideoUrl = url;

    if (socket && roomId) {
      socket.emit('sync_video', { roomId, url });
      document.getElementById('wt-status').textContent = '🟢 Synced: ...' + url.slice(-25);
    }
  }
};

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createUI);
} else {
  createUI();
}
