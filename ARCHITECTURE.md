# 📊 System Architecture - TikTok Watch Together

## Overview

This document details the complete system architecture of the TikTok Watch Together platform.

---

## High-Level Design

### System Components

```
┌─────────────────────────────────────────────┐
│                     CLIENT LAYER                         │
│  ┌─────────────────────────────────┐  │
│  │        React Component Tree                  │  │
│  │   └─ <App>                                   │  │
│  │       ├─ <Header>                            │  │
│  │       ├─ <VideoPlayer>                      │  │
│  │       ├─ <Playlist>                         │  │
│  │       ├─ <Chat>                             │  │
│  │       └─ <ShareModal>                       │  │
│  └─────────────────────────────────┘  │
│                                                       │
│  Socket.io Client Connection                        │
└─────────────────────────────────────────────┘
                         │
                 WebSocket Connection
                 (Bi-directional)
                         │
┌─────────────────────────────────────────────┐
│                    SERVER LAYER                       │
│  ┌─────────────────────────────────┐  │
│  │     Socket.io Server / Express               │  │
│  │  └─ Multi-room handler                     │  │
│  │      Event Dispatcher                        │  │
│  └─────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────┐  │
│  │     State Management (In-Memory)            │  │
│  │  └─ Map<roomId, RoomState>                  │  │
│  │      Queue, Messages, Player State           │  │
│  └─────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────┐  │
│  │     Video Cache                               │  │
│  │  └─ Map<url, mp4Url>                       │  │
│  │      Max 100 entries (LRU-like)              │  │
│  └─────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────┐  │
│  │     Scraper Queue System                     │  │
│  │  └─ Array of pending scrapes                │  │
│  │      Single Puppeteer instance               │  │
│  │      Serial processing                       │  │
│  └─────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────┐  │
│  │     Puppeteer Browser                        │  │
│  │  └─ Headless Chromium                      │  │
│  │      Video extraction engine                │  │
│  └─────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Data Flow

### 1. User Adds Video

```
User Input
    ↓
App.handleAddVideo()
    ↓
socket.emit('add_video', { roomId, video })
    ↓
Server: socket.on('add_video')
    ↓
1. Add video to room.queue with isProcessing=true
2. Broadcast 'update_queue' to all users
3. Queue scrape job: queueVideoScrape(url)
    ↓
4. Scraper checks cache
   └─ Hit: Return cached mp4Url
   └─ Miss: Add to scraperQueue
    ↓
5. scrapeVideoQueue processes serially
   └─ Launch Puppeteer
   └─ Navigate to TikTok
   └─ Extract video src
   └─ Store in cache
   └─ Return URL
    ↓
6. Update video in queue
7. Broadcast 'update_queue'
    ↓
User sees video ready to play
```

### 2. Video Playback Sync

```
User clicks Play
    ↓
VideoPlayer.handlePlay()
    ↓
socket.emit('player_play', { roomId, time })
    ↓
Server: socket.on('player_play')
    ↓
Update room state
    ↓
socket.to(roomId).emit('player_state', { playing: true, time })
    ↓
All other users receive the event
    ↓
Their VideoPlayer components update
    ↓
All videos play at ~same time
```

### 3. Room Cleanup

```
Every 30 minutes:
    ↓
Check all rooms
    ↓
For each room:
  - If room.users.size == 0
  - And lastActivity > 30 mins ago
  - Delete room from map
    ↓
Memory freed
```

---

## State Management

### Room State Object

```typescript
interface RoomState {
  id: string;                           // Room identifier
  queue: VideoItem[];                   // Playlist
  messages: ChatMessage[];              // Message history
  currentVideoIndex: number;            // Active video
  playing: boolean;                     // Play state
  currentTime: number;                  // Playback position
  users: Map<userId, UserInfo>;         // Connected users
  createdAt: number;                    // Room creation timestamp
  lastActivity: number;                 // Last event timestamp
}

interface VideoItem {
  id: number;                           // Unique ID
  url: string;                          // TikTok URL
  addedBy: string;                      // User who added it
  addedAt: string;                      // Timestamp
  isProcessing?: boolean;               // Scraping in progress
  mp4Url?: string;                      // Extracted MP4 URL
}

interface ChatMessage {
  id: number;                           // Message ID
  user: string;                         // Username
  text: string;                         // Message content
  timestamp: string;                    // Time sent
  isSystem?: boolean;                   // System message?
}
```

### Client State (React)

```typescript
// App.tsx useState hooks
const [roomId, setRoomId] = useState<string>('INIT');
const [userId, setUserId] = useState<string>('');
const [queue, setQueue] = useState<VideoItem[]>([]);
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
const [isInitialized, setIsInitialized] = useState<boolean>(false);
const [isPlaying, setIsPlaying] = useState<boolean>(false);
```

---

## Scraper Architecture

### Queue System Design

```javascript
// Global state
const scraperQueue = [];          // Array of pending tasks
let isScrapingActive = false;     // Single-threaded flag
let scrapingBrowser = null;       // Reused browser instance

// Task structure
{
  url: 'https://tiktok.com/...',
  resolve: Function,              // Promise resolve
  reject: Function,               // Promise reject
  roomId: 'room-123',
  videoId: 123
}
```

### Scraping Flow

```
queueVideoScrape(url, roomId, videoId)
    ↓
Create Promise
    ↓
Add to scraperQueue
    ↓
Call scrapeVideoQueue()
    ↓
If isScrapingActive: return (already running)
Else: set isScrapingActive = true
    ↓
While scraperQueue.length > 0:
    ↓
  1. Check cache
     └─ Hit: resolve(cached), continue
     └─ Miss: proceed to step 2
    ↓
  2. Launch browser (reuse if possible)
    ↓
  3. Set user agent & viewport
    ↓
  4. Navigate to TikTok (45s timeout)
    ↓
  5. Wait for video element (20s timeout)
    ↓
  6. Extract video.src
    ↓
  7. Close page
    ↓
  8. Cache result (max 100 entries)
    ↓
  9. resolve(videoSrc)
   ↓
After loop: set isScrapingActive = false
```

### Error Handling

```javascript
try {
  // Scraping logic
} catch (error) {
  console.error(`[Scrape Error] ${url}: ${error.message}`);
  resolve(null);  // Graceful failure
}

// Timeout wrapper
const timeoutPromise = new Promise(resolve => 
  setTimeout(() => resolve(null), 30000)
);

const mp4Url = await Promise.race([
  scrapingPromise,
  timeoutPromise
]);
// If timeout: mp4Url = null (fallback to embed)
```

---

## Socket.io Events

### Client → Server Events

| Event | Payload | Response |
|-------|---------|----------|
| `join_room` | `{ roomId, userId }` | `room_state` |
| `add_video` | `{ roomId, video }` | `update_queue` |
| `remove_video` | `{ roomId, index }` | `update_queue` |
| `change_video` | `{ roomId, index }` | `update_index` |
| `send_message` | `{ roomId, message }` | `new_message` |
| `player_play` | `{ roomId, time }` | `player_state` |
| `player_pause` | `{ roomId, time }` | `player_state` |
| `player_seek` | `{ roomId, time }` | `player_seek` |
| `request_countdown` | `{ roomId }` | `start_countdown` |

### Server → Client Events

| Event | Payload | Trigger |
|-------|---------|----------|
| `room_state` | `RoomState` | On join |
| `update_queue` | `VideoItem[]` | Video added/removed |
| `update_index` | `number` | Video changed |
| `new_message` | `ChatMessage` | Message sent |
| `system_message` | `{ text, timestamp }` | System event |
| `player_state` | `{ playing, time }` | Play/pause |
| `player_seek` | `number` | Seek action |
| `start_countdown` | `number` | Countdown requested |
| `room_users_count` | `number` | User joined/left |

---

## Performance Considerations

### Memory Management

```javascript
// Room cleanup every 30 minutes
setInterval(() => {
  const timeout = 30 * 60 * 1000;
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && 
        Date.now() - room.lastActivity > timeout) {
      rooms.delete(roomId);
    }
  }
}, 30 * 60 * 1000);

// Cache size limiting
if (videoCache.size > maxCacheSize) {
  const firstKey = videoCache.keys().next().value;
  videoCache.delete(firstKey);
}
```

### CPU Optimization

```javascript
// Serial scraping (not parallel)
// Prevents browser crashes
// Process one video at a time
// 30-second timeout per video

// Queue processing every 1 second
setInterval(scrapeVideoQueue, 1000);
```

---

## Deployment Considerations

### Scaling (Future)

**Single Server (Current)**
- In-memory state
- Local cache
- Single Puppeteer browser
- Max ~100-200 concurrent users

**Multi-Server (Redis)**
```javascript
// Shared state via Redis
// pub/sub for events
// Distributed cache
// Load balancer (Socket.io adapter)

const io = require('socket.io')(httpServer, {
  adapter: require('socket.io-redis')
});
```

### Monitoring

```javascript
// Health check endpoint
GET /health
=> {
  status: 'healthy',
  timestamp: Date.now(),
  uptime: process.uptime()
}

// Metrics to track
- Active rooms
- Total users
- Cache hit ratio
- Average scrape time
- Memory usage
- CPU usage
```

---

## Security Aspects

### Current Implementation (MVP)
- ✅ CORS headers
- ✅ Input sanitization (basic)
- ✅ Error suppression (no stack traces)
- ❌ No authentication
- ❌ No rate limiting
- ❌ No HTTPS enforcement

### Future Security
- [ ] JWT authentication
- [ ] Rate limiting per IP
- [ ] Room access control
- [ ] Message filtering
- [ ] Input validation schema
- [ ] HTTPS redirect

---

## Glossary

- **Room**: Isolated watch party (contains queue, messages, state)
- **Queue**: List of videos to watch
- **Scraper**: Puppeteer browser that extracts MP4 URLs
- **Cache**: Map of TikTok URLs to MP4 URLs (max 100)
- **Socket.io**: WebSocket library for real-time communication
- **React Player**: Library that plays MP4 videos
- **MP4 URL**: Direct video file URL (perfect sync)
- **Embed Fallback**: Official TikTok embed (limited sync)

---

For implementation details, see the source code in `/server` and `/src` directories.
