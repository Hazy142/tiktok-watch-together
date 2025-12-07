import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import VideoPlayer from './components/VideoPlayer';
import Playlist from './components/Playlist';
import Chat from './components/Chat';
import ShareModal from './components/ShareModal';
import {
  generateRoomId,
  generateUserId,
  getCurrentTime
} from './constants';
import { VideoItem, ChatMessage } from './types';
import { socket } from './socket';

function App() {
  // Core State
  const [roomId, setRoomId] = useState<string>('INIT');
  const [userId, setUserId] = useState<string>('');
  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Auto-Follow Sync State
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  // Initialize Room
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get('room');
    const savedRoomId = localStorage.getItem('wt_roomId');
    const finalRoomId = urlRoomId || savedRoomId || generateRoomId();

    let finalUserId = localStorage.getItem('wt_userId');
    if (!finalUserId) {
      finalUserId = generateUserId();
      localStorage.setItem('wt_userId', finalUserId);
    }

    setRoomId(finalRoomId);
    setUserId(finalUserId);

    if (!savedRoomId || savedRoomId !== finalRoomId) {
      localStorage.setItem('wt_roomId', finalRoomId);
    }

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', finalRoomId);
    window.history.pushState({}, '', newUrl);

    socket.emit('join_room', { roomId: finalRoomId, userId: finalUserId });
    setIsInitialized(true);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  // Socket Event Listeners
  useEffect(() => {
    if (!isInitialized || roomId === 'INIT') return;

    console.log(`[Room Init] Connected to room ${roomId}`);

    const handleRoomState = (state: any) => {
      console.log(`[Room State] Received state for room ${roomId}`, state);
      if (state.queue) setQueue(state.queue);
      if (state.messages) setMessages(state.messages);
      if (typeof state.currentVideoIndex === 'number') setCurrentVideoIndex(state.currentVideoIndex);
      if (typeof state.playing === 'boolean') setIsPlaying(state.playing);
    };

    const handleUpdateQueue = (newQueue: VideoItem[]) => {
      console.log(`[Queue Update] Updated for room ${roomId}`, newQueue);
      setQueue(newQueue);
    };

    const handleUpdateIndex = (index: number) => {
      console.log(`[Index Update] Changed to ${index} in room ${roomId}`);
      setCurrentVideoIndex(index);
    };

    const handleNewMessage = (message: ChatMessage) => {
      console.log(`[Message] New message in room ${roomId}`);
      setMessages(prev => [...prev.slice(-49), message]);
    };

    const handleSystemMessage = (data: { text: string }) => {
      console.log(`[System Message] ${data.text}`);
      const newMessage: ChatMessage = {
        id: Date.now(),
        user: 'SYSTEM',
        text: data.text,
        timestamp: getCurrentTime(),
        isSystem: true,
      };
      setMessages(prev => [...prev.slice(-49), newMessage]);
    };

    // 🔄 Auto-Follow Change Video Handler
    const handleChangeVideo = ({ url, timestamp, message }: { url: string; timestamp: number; message: string }) => {
      console.log(`[🔄 Change Video] Streamer navigated to: ${url}`);

      // Validate URL
      if (!url || !url.includes('tiktok.com/') || !url.includes('/video/')) {
        console.warn('[⚠️ Invalid URL] Ignoring:', url);
        return;
      }

      // Show notification
      setSyncNotification('🔄 Streamer scrolled to new video...');
      setTimeout(() => setSyncNotification(null), 3000);

      // Create new video item
      const newItem: VideoItem = {
        id: Date.now(),
        url,
        addedBy: 'Streamer',
        addedAt: getCurrentTime(),
      };

      // Replace queue with synced video
      setQueue([newItem]);
      setCurrentVideoIndex(0);

      // Add system message
      const sysMessage: ChatMessage = {
        id: Date.now(),
        user: 'SYSTEM',
        text: `🔄 ${message}`,
        timestamp: getCurrentTime(),
        isSystem: true,
      };
      setMessages(prev => [...prev.slice(-49), sysMessage]);
    };

    // Register listeners
    socket.on('room_state', handleRoomState);
    socket.on('update_queue', handleUpdateQueue);
    socket.on('update_index', handleUpdateIndex);
    socket.on('new_message', handleNewMessage);
    socket.on('system_message', handleSystemMessage);
    socket.on('change_video', handleChangeVideo);

    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('update_queue', handleUpdateQueue);
      socket.off('update_index', handleUpdateIndex);
      socket.off('new_message', handleNewMessage);
      socket.off('system_message', handleSystemMessage);
      socket.off('change_video', handleChangeVideo);
    };
  }, [isInitialized, roomId]);

  // Handlers
  const handleNewRoom = () => {
    if (!window.confirm("Are you sure? This will start a new room.")) return;
    const newId = generateRoomId();
    localStorage.setItem('wt_roomId', newId);
    window.location.href = `/?room=${newId}`;
  };

  const handleAddVideo = (url: string) => {
    const newItem: VideoItem = {
      id: Date.now(),
      url,
      addedBy: userId,
      addedAt: getCurrentTime(),
    };
    console.log(`[Add Video] Adding to room ${roomId}:`, url);
    socket.emit('add_video', { roomId, video: newItem });
  };

  const handleRemoveVideo = (index: number) => {
    console.log(`[Remove Video] Removing index ${index} from room ${roomId}`);
    socket.emit('remove_video', { roomId, index });
  };

  const handleSelectVideo = (index: number) => {
    console.log(`[Select Video] Changing to index ${index} in room ${roomId}`);
    socket.emit('change_video', { roomId, index });
  };

  const handleSendMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: Date.now(),
      user: userId,
      text,
      timestamp: getCurrentTime(),
      isSystem: false,
    };
    console.log(`[Send Message] Message in room ${roomId}:`, text);
    socket.emit('send_message', { roomId, message: newMessage });
  };

  const handleNext = () => {
    if (currentVideoIndex < queue.length - 1) {
      handleSelectVideo(currentVideoIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentVideoIndex > 0) {
      handleSelectVideo(currentVideoIndex - 1);
    }
  };

  if (!isInitialized || roomId === 'INIT') {
    return <div className="flex items-center justify-center h-screen bg-dark text-main">Loading Room...</div>;
  }

  const currentVideo = queue[currentVideoIndex];

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Header
        roomId={roomId}
        onNewRoom={handleNewRoom}
        onShare={() => setIsShareModalOpen(true)}
      />

      {/* Sync Notification Toast */}
      {syncNotification && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 242, 234, 0.95)',
          color: '#000',
          padding: '12px 24px',
          borderRadius: '8px',
          fontWeight: 'bold',
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0, 242, 234, 0.4)',
        }}>
          {syncNotification}
        </div>
      )}

      <main className="main-grid">
        {/* Left Column: Player + Playlist */}
        <div className="flex flex-col gap-lg h-full overflow-hidden">
          <div className="flex-1 min-h-[400px]">
            <VideoPlayer
              url={currentVideo?.url || null}
              currentIndex={currentVideoIndex}
              totalVideos={queue.length}
              onNext={handleNext}
              onPrev={handlePrev}
              socket={socket}
              roomId={roomId}
            />
          </div>

          <div className="h-[300px]">
            <Playlist
              queue={queue}
              currentIndex={currentVideoIndex}
              onAddVideo={handleAddVideo}
              onRemoveVideo={handleRemoveVideo}
              onSelectVideo={handleSelectVideo}
            />
          </div>
        </div>

        {/* Right Column: Chat */}
        <div className="h-full">
          <Chat
            messages={messages}
            onSendMessage={handleSendMessage}
            currentUserId={userId}
          />
        </div>
      </main>

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
      />
    </div>
  );
}

export default App;
