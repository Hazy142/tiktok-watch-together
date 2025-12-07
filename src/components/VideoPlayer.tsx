import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { Socket } from 'socket.io-client';
import { TIKTOK_SCRIPT_URL } from '../constants';

interface VideoPlayerProps {
  url: string | null;
  mp4Url?: string;
  videoType?: 'mp4' | 'embed' | 'unknown'; // 🆕 Neuer Type vom Server
  isProcessing?: boolean;
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
  videoType = 'unknown', // Default
  isProcessing,
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
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);

  // TikTok Script Helper für Embed Mode
  useEffect(() => {
    if (videoType === 'embed' && !document.getElementById('tiktok-embed-script')) {
      const script = document.createElement('script');
      script.id = 'tiktok-embed-script';
      script.src = TIKTOK_SCRIPT_URL;
      script.async = true;
      document.body.appendChild(script);
    }
    // Reload Embeds wenn sich URL ändert
    if (videoType === 'embed' && window.tiktok?.embed) {
      window.tiktok.embed.load();
    }
  }, [url, videoType]);

  // PROXY URL BAUEN
  useEffect(() => {
    if (mp4Url && videoType === 'mp4') {
      // Wir leiten den Traffic über unseren eigenen Server
      const proxy = `http://localhost:3001/proxy-video?url=${encodeURIComponent(mp4Url)}`;
      setProxyUrl(proxy);
    } else {
      setProxyUrl(null);
    }
  }, [mp4Url, videoType]);

  // Socket Events
  useEffect(() => {
    const handlePlayerState = (state: { playing: boolean, time: number }) => {
      setPlaying(state.playing);
      if (playerRef.current && videoType === 'mp4') {
        const currentParams = playerRef.current.getCurrentTime();
        if (Math.abs(currentParams - state.time) > 1) {
          playerRef.current.seekTo(state.time, 'seconds');
        }
      }
    };

    socket.on('player_state', handlePlayerState);

    socket.on('player_seek', (time: number) => {
      if (playerRef.current) playerRef.current.seekTo(time, 'seconds');
    });

    socket.on('start_countdown', (count: number) => {
      setCountdown(count);
      let current = count;
      const interval = setInterval(() => {
        current--;
        setCountdown(current);
        if (current <= 0) {
          clearInterval(interval);
          setCountdown(null);
          setPlaying(true); // Versuch Auto-Play
        }
      }, 1000);
    });

    return () => {
      socket.off('player_state', handlePlayerState);
      socket.off('player_seek');
      socket.off('start_countdown');
    };
  }, [socket, videoType]);

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

  const handleSyncRequest = () => {
    socket.emit('request_countdown', { roomId });
  };

  // Video ID für Embed extrahieren
  const getVideoId = (url: string) => {
    const match = url.match(/video\/(\d+)/);
    return match ? match[1] : '';
  };

  if (!url) return <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-gray-500 border border-white/10">Kein Video</div>;

  if (isProcessing) return <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-[#00f2ea] border border-white/10 animate-pulse">🚀 Analysiere Video...</div>;

  return (
    <div className="player-container w-full bg-black relative flex flex-col group rounded-xl overflow-hidden shadow-2xl border border-white/10">

      <div className="relative aspect-[9/16] md:aspect-video bg-black flex justify-center items-center overflow-hidden">

        {/* === MODUS 1: PROXY MP4 (Perfekter Sync) === */}
        {videoType === 'mp4' && proxyUrl && (
          <ReactPlayer
            ref={playerRef}
            url={proxyUrl} // 🔥 Wir nutzen den Proxy!
            playing={playing}
            controls={true}
            width="100%"
            height="100%"
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={onNext}
            config={{
              file: { attributes: { crossOrigin: "anonymous" } }
            }}
            style={{ maxHeight: '75vh' }}
          />
        )}

        {/* === MODUS 2: EMBED FALLBACK (Manueller Sync) === */}
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
              <section><a target="_blank" href={url}>{url}</a></section>
            </blockquote>
          </div>
        )}

        {/* Countdown Overlay (Für beide Modi nützlich) */}
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
          <button onClick={onPrev} disabled={currentIndex === 0} className="text-white hover:text-[#00f2ea] disabled:opacity-30 transition-colors font-bold text-sm">⏮ PREV</button>
          <button onClick={onNext} disabled={currentIndex === totalVideos - 1} className="text-white hover:text-[#00f2ea] disabled:opacity-30 transition-colors font-bold text-sm">NEXT ⏭</button>
        </div>

        <div className="flex items-center gap-2">
          {videoType === 'mp4' ?
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded border border-green-500/30">⚡ PROXY SYNC</span> :
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded border border-yellow-500/30">⚠️ EMBED MODE</span>
          }
          <div className="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">
            {currentIndex + 1} / {totalVideos}
          </div>
        </div>

        <div>
          <button onClick={handleSyncRequest} className="bg-[#ff0050] hover:bg-[#d60043] text-white text-xs font-bold py-1.5 px-3 rounded shadow-lg shadow-red-900/20">
            SYNC (3-2-1)
          </button>
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