import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
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

// Connect to backend
const socket: Socket = io('http://localhost:3001');

function App() {
  // State
  const [roomId, setRoomId] = useState<string>('INIT');
  const [userId, setUserId] = useState<string>('');
  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Initialize Room
  useEffect(() => {
    // Check URL or LocalStorage for Room ID
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get('room');
    const savedRoomId = localStorage.getItem('wt_roomId');
    const finalRoomId = urlRoomId || savedRoomId || generateRoomId();

    // Generate User ID for this session
    let finalUserId = localStorage.getItem('wt_userId');
    if (!finalUserId) {
      finalUserId = generateUserId();
      localStorage.setItem('wt_userId', finalUserId);
    }

    setRoomId(finalRoomId);
    setUserId(finalUserId);

    // Save current room ID
    if (!savedRoomId || savedRoomId !== finalRoomId) {
      localStorage.setItem('wt_roomId', finalRoomId);
    }

    // Update URL without reload
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('room', finalRoomId);
    window.history.pushState({}, '', newUrl);

    // Join Room via Socket
    socket.emit('join_room', { roomId: finalRoomId, userId: finalUserId });

    setIsInitialized(true);

    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  // Socket Event Listeners
  useEffect(() => {
    if (!isInitialized) return;

    socket.on('room_state', (state: any) => {
      setQueue(state.queue);
      setMessages(state.messages);
      setCurrentVideoIndex(state.currentVideoIndex);
      setIsPlaying(state.playing);
    });

    socket.on('update_queue', (newQueue: VideoItem[]) => {
      setQueue(newQueue);
    });

    socket.on('update_index', (index: number) => {
      setCurrentVideoIndex(index);
    });

    socket.on('new_message', (message: ChatMessage) => {
      setMessages(prev => [...prev.slice(-49), message]);
    });

    socket.on('system_message', (data: { text: string }) => {
      const newMessage: ChatMessage = {
        id: Date.now(),
        user: 'SYSTEM',
        text: data.text,
        timestamp: getCurrentTime(),
        isSystem: true,
      };
      setMessages(prev => [...prev.slice(-49), newMessage]);
    });

    return () => {
      socket.off('room_state');
      socket.off('update_queue');
      socket.off('update_index');
      socket.off('new_message');
      socket.off('system_message');
    };
  }, [isInitialized]);

  // Logic
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
    socket.emit('add_video', { roomId, video: newItem });
  };

  const handleRemoveVideo = (index: number) => {
    socket.emit('remove_video', { roomId, index });
  };

  const handleSelectVideo = (index: number) => {
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
    // Optimistic update? No, let's wait for server to ensure order
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

  if (!isInitialized) return <div className="flex items-center justify-center h-screen bg-dark text-main">Loading...</div>;

  const currentVideo = queue[currentVideoIndex];

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Header
        roomId={roomId}
        onNewRoom={handleNewRoom}
        onShare={() => setIsShareModalOpen(true)}
      />

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