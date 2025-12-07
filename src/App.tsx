import React, { useEffect, useState } from 'react';
import { SocketProvider } from './context/SocketContext';
import { VideoProvider } from './context/VideoContext';
import { ChatProvider } from './context/ChatContext';
import Header from './components/Header';
import VideoPlayer from './components/VideoPlayer';
import Playlist from './components/Playlist';
import Chat from './components/Chat';
import './styles/global.css'; // Changed from App.css
import StreamerSelector from './components/StreamerSelector';

function App() {
  const [roomId, setRoomId] = useState<string>('');

  useEffect(() => {
    // Get room ID from URL
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setRoomId(room);
    } else {
      // Generate random room ID if none exists
      const newRoom = Math.random().toString(36).substring(7);
      window.history.pushState({}, '', `?room=${newRoom}`);
      setRoomId(newRoom);
    }
  }, []);

  if (!roomId) return <div>Loading...</div>;

  return (
    <SocketProvider roomId={roomId}>
      <VideoProvider>
        <ChatProvider>
          <div className="app-container">
            <Header roomId={roomId} />
            <div className="main-content">
              <div className="left-panel">
                <div className="video-area">
                   <VideoPlayer />
                </div>
                <StreamerSelector />
              </div>
              <div className="right-panel">
                <Playlist />
                <Chat />
              </div>
            </div>
          </div>
        </ChatProvider>
      </VideoProvider>
    </SocketProvider>
  );
}

export default App;
