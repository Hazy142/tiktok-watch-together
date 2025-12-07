import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { TIKTOK_SCRIPT_URL } from '../constants';

interface VideoPlayerProps {
  url: string | null;
  currentIndex: number;
  totalVideos: number;
  onNext: () => void;
  onPrev: () => void;
  socket: Socket;
  roomId: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  currentIndex,
  totalVideos,
  onNext,
  onPrev,
  socket,
  roomId
}) => {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Check if URL is a TikTok video
  const isTikTokVideo = url?.includes('tiktok.com') && url?.includes('/video/');

  // Extract video ID from URL
  const getVideoId = (videoUrl: string) => {
    const match = videoUrl.match(/video\/(\d+)/);
    return match ? match[1] : '';
  };

  // Load TikTok embed script
  useEffect(() => {
    if (isTikTokVideo && !document.getElementById('tiktok-embed-script')) {
      const script = document.createElement('script');
      script.id = 'tiktok-embed-script';
      script.src = TIKTOK_SCRIPT_URL;
      script.async = true;
      document.body.appendChild(script);
    }

    // Reload embeds when URL changes
    if (isTikTokVideo && (window as any).tiktok?.embed) {
      setTimeout(() => {
        (window as any).tiktok.embed.load();
      }, 200);
    }
  }, [url, isTikTokVideo]);

  // Socket countdown handler
  useEffect(() => {
    const handleCountdown = (count: number) => {
      setCountdown(count);
      let current = count;
      const interval = setInterval(() => {
        current--;
        setCountdown(current);
        if (current <= 0) {
          clearInterval(interval);
          setCountdown(null);
        }
      }, 1000);
    };

    socket.on('start_countdown', handleCountdown);
    return () => {
      socket.off('start_countdown', handleCountdown);
    };
  }, [socket]);

  // Sync button handler
  const handleSyncRequest = () => {
    socket.emit('request_countdown', { roomId });
  };

  // No video state
  if (!url) {
    return (
      <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-gray-500 border border-white/10">
        <div className="text-center">
          <div className="text-4xl mb-2">📺</div>
          <div>Kein Video - Warte auf Streamer...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="player-container w-full bg-black relative flex flex-col group rounded-xl overflow-hidden shadow-2xl border border-white/10">
      <div className="relative aspect-[9/16] md:aspect-video bg-black flex justify-center items-center overflow-hidden">

        {/* TikTok Embed */}
        {isTikTokVideo && (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 overflow-y-auto p-4">
            <div className="bg-[#00f2ea]/10 border border-[#00f2ea]/50 text-[#00f2ea] px-4 py-2 rounded mb-4 text-sm flex items-center gap-2">
              🔄 <span>Live Sync aktiv! Video vom Streamer:</span>
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

        {/* Non-TikTok URL fallback */}
        {url && !isTikTokVideo && (
          <div className="w-full h-full flex items-center justify-center text-yellow-400">
            <div className="text-center">
              <div className="text-2xl mb-2">⚠️</div>
              <div>URL nicht unterstützt</div>
              <div className="text-xs text-gray-500 mt-2">{url}</div>
            </div>
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
          <span className="text-xs bg-[#00f2ea]/20 text-[#00f2ea] px-2 py-1 rounded border border-[#00f2ea]/30">
            🔄 AUTO-FOLLOW
          </span>
          <div className="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">
            {currentIndex + 1} / {totalVideos || 1}
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
