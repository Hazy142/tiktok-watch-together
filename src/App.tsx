import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

function App() {
  const [roomId, setRoomId] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [inputRoom, setInputRoom] = useState('');

  // Socket connection
  useEffect(() => {
    socket.on('connect', () => console.log('Connected to server'));
    socket.on('disconnect', () => setConnected(false));

    socket.on('sync_video', ({ url }) => {
      console.log('Received video:', url);
      setVideoUrl(url);

      // Reload TikTok embed script
      setTimeout(() => {
        if ((window as any).tiktok?.embed) {
          (window as any).tiktok.embed.load();
        }
      }, 100);
    });

    return () => {
      socket.off('sync_video');
    };
  }, []);

  // Load TikTok embed script once
  useEffect(() => {
    if (!document.getElementById('tiktok-embed')) {
      const script = document.createElement('script');
      script.id = 'tiktok-embed';
      script.src = 'https://www.tiktok.com/embed.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const joinRoom = () => {
    if (!inputRoom.trim()) return;
    setRoomId(inputRoom);
    socket.emit('join_room', { roomId: inputRoom });
    setConnected(true);
  };

  // Extract video ID for embed
  const getVideoId = (url: string) => {
    const match = url.match(/video\/(\d+)/);
    return match ? match[1] : '';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      padding: '20px'
    }}>
      {/* Header */}
      <header style={{
        textAlign: 'center',
        marginBottom: '30px'
      }}>
        <h1 style={{
          fontSize: '2rem',
          background: 'linear-gradient(90deg, #00f2ea, #ff0050)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: 0
        }}>
          🎬 TikTok Watch Together
        </h1>
      </header>

      {/* Join Room */}
      {!connected ? (
        <div style={{
          maxWidth: '400px',
          margin: '100px auto',
          textAlign: 'center'
        }}>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={inputRoom}
            onChange={(e) => setInputRoom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '16px',
              border: '2px solid #00f2ea',
              borderRadius: '10px',
              background: '#111',
              color: 'white',
              marginBottom: '15px'
            }}
          />
          <button
            onClick={joinRoom}
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '16px',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '10px',
              background: 'linear-gradient(90deg, #00f2ea, #00d4ce)',
              color: 'black',
              cursor: 'pointer'
            }}
          >
            Join Room
          </button>
        </div>
      ) : (
        /* Video Display */
        <div style={{
          maxWidth: '500px',
          margin: '0 auto'
        }}>
          <div style={{
            background: 'rgba(0,242,234,0.1)',
            border: '1px solid rgba(0,242,234,0.3)',
            borderRadius: '10px',
            padding: '15px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            <span style={{ color: '#00f2ea' }}>🟢 Room: {roomId}</span>
          </div>

          {videoUrl ? (
            <div style={{
              background: '#111',
              borderRadius: '15px',
              padding: '20px',
              border: '1px solid #333'
            }}>
              <div style={{
                background: 'rgba(0,242,234,0.1)',
                padding: '10px',
                borderRadius: '8px',
                marginBottom: '15px',
                fontSize: '14px',
                color: '#00f2ea'
              }}>
                🔄 Synced from Streamer
              </div>

              <blockquote
                className="tiktok-embed"
                cite={videoUrl}
                data-video-id={getVideoId(videoUrl)}
                style={{ maxWidth: '325px', margin: '0 auto' }}
              >
                <section>
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                    Loading TikTok...
                  </a>
                </section>
              </blockquote>
            </div>
          ) : (
            <div style={{
              background: '#111',
              borderRadius: '15px',
              padding: '60px 20px',
              textAlign: 'center',
              border: '1px solid #333'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>📺</div>
              <div style={{ color: '#666' }}>Waiting for streamer...</div>
              <div style={{ color: '#444', fontSize: '12px', marginTop: '10px' }}>
                Ask the streamer to start syncing on TikTok
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
