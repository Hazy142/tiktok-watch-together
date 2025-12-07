import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { Socket } from 'socket.io-client';
import { TIKTOK_SCRIPT_URL } from '../constants';

interface VideoPlayerProps {
  url: string | null;
  mp4Url?: string;
  videoType?: 'mp4' | 'embed' | 'unknown';
  useScreenShare?: boolean;
  isProcessing?: boolean;
  streamFrame?: string | null;
  streamerId?: string | null;
  isStreamMode?: boolean;
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
  videoType = 'unknown',
  useScreenShare,
  isProcessing,
  streamFrame,
  streamerId,
  isStreamMode,
  currentIndex,
  totalVideos,
  onNext,
  onPrev,
  socket,
  roomId
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);
  const playerRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);

  // TikTok Embed Script laden
  useEffect(() => {
    if (videoType === 'embed' && !document.getElementById('tiktok-embed-script')) {
      const script = document.createElement('script');
      script.id = 'tiktok-embed-script';
      script.src = TIKTOK_SCRIPT_URL;
      script.async = true;
      document.body.appendChild(script);
    }

    // Embeds neu laden wenn URL ändert
    if (videoType === 'embed' && (window as any).tiktok?.embed) {
      (window as any).tiktok.embed.load();
    }
  }, [url, videoType]);

  // Socket Event Handlers
  useEffect(() => {
    const handlePlayerState = (state: { playing: boolean; time: number }) => {
      setPlaying(state.playing);
      if (playerRef.current && videoType === 'mp4') {
        const currentTime = playerRef.current.getCurrentTime();
        if (Math.abs(currentTime - state.time) > 1) {
          playerRef.current.seekTo(state.time, 'seconds');
        }
      }
    };

    const handlePlayerSeek = (time: number) => {
      if (playerRef.current) {
        playerRef.current.seekTo(time, 'seconds');
      }
    };

    const handleCountdown = (count: number) => {
      setCountdown(count);
      let current = count;
      const interval = setInterval(() => {
        current--;
        setCountdown(current);
        if (current <= 0) {
          clearInterval(interval);
          setCountdown(null);
          setPlaying(true);
        }
      }, 1000);
    };

    socket.on('player_state', handlePlayerState);
    socket.on('player_seek', handlePlayerSeek);
    socket.on('start_countdown', handleCountdown);

    return () => {
      socket.off('player_state', handlePlayerState);
      socket.off('player_seek', handlePlayerSeek);
      socket.off('start_countdown', handleCountdown);
    };
  }, [socket, videoType]);

  // Play Handler
  const handlePlay = () => {
    if (!playing) {
      setPlaying(true);
      socket.emit('player_play', {
        roomId,
        time: playerRef.current ? playerRef.current.getCurrentTime() : 0
      });
    }
  };

  // Pause Handler
  const handlePause = () => {
    if (playing) {
      setPlaying(false);
      socket.emit('player_pause', {
        roomId,
        time: playerRef.current ? playerRef.current.getCurrentTime() : 0
      });
    }
  };

  // Sync Button Handler
  const handleSyncRequest = () => {
    socket.emit('request_countdown', { roomId });
  };

  // Video ID extrahieren für Embed
  const getVideoId = (url: string) => {
    const match = url.match(/video\/(\d+)/);
    return match ? match[1] : '';
  };

  // Loading State
  if (!url) {
    return (
      <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-gray-500 border border-white/10">
        Kein Video
      </div>
    );
  }

  // Processing State
  if (isProcessing) {
    return (
      <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-[#00f2ea] border border-white/10 animate-pulse">
        🚀 Analysiere Video...
      </div>
    );
  }

  return (
    <div className="player-container w-full bg-black relative flex flex-col group rounded-xl overflow-hidden shadow-2xl border border-white/10">
      <div className="relative aspect-[9/16] md:aspect-video bg-black flex justify-center items-center overflow-hidden">
        {/* === MP4 MODE (Server sendet Proxy-URL direkt!) === */}
        {videoType === 'mp4' && mp4Url && (
          <ReactPlayer
            ref={playerRef}
            src={mp4Url}
            playing={playing}
            controls={true}
            width="100%"
            height="100%"
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={onNext}
            onError={(e) => {
              console.error('[Player Error]', e);
            }}
            config={{
              html: {
                attributes: {
                  crossOrigin: 'anonymous',
                  playsInline: true
                }
              }
            }}
            style={{ maxHeight: '75vh' }}
          />
        )}

        {/* === EMBED MODE (Fallback) === */}
        {videoType === 'embed' && (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 overflow-y-auto p-4">
            <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-200 px-4 py-2 rounded mb-4 text-sm flex items-center gap-2">
              ⚠️ <span>Direkt-Stream nicht möglich. Bitte <b>gleichzeitig</b> starten!</span>
            </div>
            <blockquote
              className="tiktok-embed"
              cite={url}
              data-video-id={getVideoId(url)}
              style={{ maxWidth: '325px', minWidth: '325px' }}
            >
              <section>
                <a target="_blank" rel="noopener noreferrer" href={url}>
                  {url}
                </a>
              </section>
            </blockquote>
          </div>
        )}

        {/* Countdown Overlay */}
        {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 pointer-events-none">
            <div className="text-9xl font-bold text-[#00f2ea] animate-bounce">
              {countdown}
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="bg-[#0a0a0a] p-3 flex items-center justify-between border-t border-white/10">
        <div className="flex gap-3">
          <button
            onClick={onPrev}
            disabled={currentIndex === 0}
            className="text-white hover:text-[#00f2ea] disabled:opacity-30 transition-colors font-bold text-sm"
          >
            ⏮ PREV
          </button>
          <button
            onClick={onNext}
            disabled={currentIndex === totalVideos - 1}
            className="text-white hover:text-[#00f2ea] disabled:opacity-30 transition-colors font-bold text-sm"
          >
            NEXT ⏭
          </button>
        </div>

        <div className="flex items-center gap-2">
          {videoType === 'mp4' ? (
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded border border-green-500/30">
              ⚡ PROXY SYNC
            </span>
          ) : (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded border border-yellow-500/30">
              ⚠️ EMBED MODE
            </span>
          )}
          <div className="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">
            {currentIndex + 1} / {totalVideos}
          </div>
        </div>

        <div>
          <button
            onClick={handleSyncRequest}
            className="bg-[#ff0050] hover:bg-[#d60043] text-white text-xs font-bold py-1.5 px-3 rounded shadow-lg shadow-red-900/20"
          >
            SYNC (3-2-1)
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
