import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { TIKTOK_SCRIPT_URL } from '../constants';
import { Socket } from 'socket.io-client';

interface VideoPlayerProps {
  url: string | null;
  mp4Url?: string;
  useScreenShare?: boolean;
  isProcessing?: boolean;
  streamFrame?: string | null;      // 🎬 NEW: from App state
  streamerId?: string | null;       // 🎬 NEW: from App state
  isStreamMode?: boolean;           // 🎬 NEW: from App state
  currentIndex: number;
  totalVideos: number;
  onNext: () => void;
  onPrev: () => void;
  socket: Socket;
  roomId: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  mp4Url,
  useScreenShare,
  isProcessing,
  streamFrame,      // 🎬 NEW
  streamerId,       // 🎬 NEW
  isStreamMode,     // 🎬 NEW
  currentIndex,
  totalVideos,
  onNext,
  onPrev,
  socket,
  roomId
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const playerRef = useRef<ReactPlayer>(null);
  const [playing, setPlaying] = useState(false);

  // TikTok Embed Script Loading
  useEffect(() => {
    if (!mp4Url && !useScreenShare && !isStreamMode && url) {
      const scriptId = 'tiktok-embed-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = TIKTOK_SCRIPT_URL;
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, [mp4Url, useScreenShare, isStreamMode, url]);

  useEffect(() => {
    if (!mp4Url && !useScreenShare && !isStreamMode && window.tiktok && window.tiktok.embed) {
      window.tiktok.embed.load();
    }
  }, [url, mp4Url, useScreenShare, isStreamMode]);

  // Socket Events for Sync (Only for MP4)
  useEffect(() => {
    if (!mp4Url || useScreenShare || isStreamMode) return;

    socket.on('player_state', (state: { playing: boolean, time: number }) => {
      setPlaying(state.playing);
      if (playerRef.current && Math.abs(playerRef.current.getCurrentTime() - state.time) > 2) {
        playerRef.current.seekTo(state.time);
      }
    });

    socket.on('player_seek', (time: number) => {
      if (playerRef.current) {
        playerRef.current.seekTo(time);
      }
    });

    return () => {
      socket.off('player_state');
      socket.off('player_seek');
    };
  }, [socket, mp4Url, useScreenShare, isStreamMode]);

  // Countdown Logic
  useEffect(() => {
    socket.on('start_countdown', (count: number) => {
      setCountdown(count);
      if (count > 0) {
        const interval = setInterval(() => {
          setCountdown(prev => {
            if (prev === 1) {
              setTimeout(() => setCountdown(null), 1000);
              return 0;
            }
            return prev !== null && prev > 0 ? prev - 1 : null;
          });
        }, 1000);
      }
    });

    return () => {
      socket.off('start_countdown');
    };
  }, [socket]);

  // Handlers
  const handlePlay = () => {
    if (!playing) {
      setPlaying(true);
      socket.emit('player_play', {
        roomId,
        time: playerRef.current ? playerRef.current.getCurrentTime() : 0
      });
    }
  };

  const handlePause = () => {
    if (playing) {
      setPlaying(false);
      socket.emit('player_pause', {
        roomId,
        time: playerRef.current ? playerRef.current.getCurrentTime() : 0
      });
    }
  };

  const handleSyncClick = () => {
    socket.emit('request_countdown', { roomId });
  };

  const handleForceSync = () => {
    socket.emit('change_video', { roomId, index: currentIndex });
  };

  // Render
  if (!url) {
    return (
      <div className="player-container flex items-center justify-center text-muted">
        <div className="text-center">
          <h3 className="text-xl mb-2">No video playing</h3>
          <p>Add a TikTok link to the playlist to start watching.</p>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="player-container flex items-center justify-center text-muted">
        <div className="text-center animate-pulse">
          <h3 className="text-xl mb-2">Processing Video...</h3>
          <p>Attempting MP4 extraction (5s timeout)</p>
          <p className="text-sm mt-2">Will auto-switch to Screen Share if needed.</p>
        </div>
      </div>
    );
  }

  // Extract Video ID for embed fallback
  const videoIdMatch = url.match(/video\/(\d+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : '';

  return (
    <div className="player-container h-full w-full flex flex-col relative group bg-black">
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">

        {/* 🎬 SCREEN SHARE MODE - Check streamFrame from props */}
        {(useScreenShare || isStreamMode) && streamFrame ? (
          <div className="w-full h-full flex flex-col items-center justify-center relative">
            <img 
              src={streamFrame} 
              alt="Stream" 
              className="w-full h-full object-contain"
              style={{ background: 'black' }}
            />
            <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold animate-pulse">
              🔴 LIVE STREAM (10 FPS)
            </div>
            {streamerId && (
              <div className="absolute bottom-4 left-4 bg-gray-900/80 text-gray-300 px-3 py-1 rounded text-xs">
                Streamer: {streamerId}
              </div>
            )}
          </div>
        ) : (useScreenShare || isStreamMode) ? (
          // Waiting for stream
          <div className="w-full h-full flex flex-col items-center justify-center bg-black">
            <div className="text-center animate-pulse">
              <p className="text-white mb-2">🎬 Waiting for stream...</p>
              <p className="text-gray-400 text-sm">Connecting to screen share</p>
            </div>
          </div>
        ) : mp4Url ? (
          // DIRECT MP4 PLAYER
          <ReactPlayer
            ref={playerRef}
            url={mp4Url}
            playing={playing}
            controls={true}
            width="100%"
            height="100%"
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={onNext}
          />
        ) : (
          // FALLBACK: TikTok Embed
          <blockquote
            className="tiktok-embed"
            cite={url}
            data-video-id={videoId}
            style={{ maxWidth: '100%', minWidth: '325px' }}
          >
            <section>
              <a target="_blank" href={url} rel="noreferrer">
                {url}
              </a>
            </section>
          </blockquote>
        )}

        {/* Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-50 pointer-events-none">
            <div className="text-9xl font-bold text-primary animate-pulse">
              {countdown === 0 ? "PLAY!" : countdown}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="player-controls flex items-center justify-between z-10">
        <div className="flex items-center gap-md">
          <button
            onClick={onPrev}
            disabled={currentIndex === 0}
            className={`btn btn-icon ${currentIndex === 0 ? 'opacity-50 cursor-not-allowed' : 'btn-ghost'}`}
          >
            Prev
          </button>

          <span className="text-sm font-mono">
            {currentIndex + 1} / {totalVideos}
          </span>

          <button
            onClick={onNext}
            disabled={currentIndex === totalVideos - 1}
            className={`btn btn-icon ${currentIndex === totalVideos - 1 ? 'opacity-50 cursor-not-allowed' : 'btn-ghost'}`}
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-2">
          {mp4Url && !useScreenShare && !isStreamMode && (
            <span className="text-xs text-green-400 border border-green-400 px-2 py-0.5 rounded">
              ✅ Synced
            </span>
          )}

          {(useScreenShare || isStreamMode) && (
            <span className="text-xs text-red-400 border border-red-400 px-2 py-0.5 rounded animate-pulse">
              🎬 Screen Share
            </span>
          )}

          <button
            onClick={handleForceSync}
            className="btn btn-ghost text-xs text-muted hover:text-white"
            title="Force everyone to jump to this video"
          >
            Resync All
          </button>

          {!mp4Url && !useScreenShare && !isStreamMode && (
            <button
              onClick={handleSyncClick}
              className="btn btn-secondary text-xs"
              title="Count down 3-2-1 to help everyone press play at the same time"
            >
              Sync Play (3-2-1)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

declare global {
  interface Window {
    tiktok: any;
  }
}

export default VideoPlayer;
