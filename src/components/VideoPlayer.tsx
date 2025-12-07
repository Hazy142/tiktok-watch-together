import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { Socket } from 'socket.io-client';

interface VideoPlayerProps {
  url: string | null;
  mp4Url?: string;
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
  const [error, ZSerror] = useState<string | null>(null); // Neuer Error State

  // Reset Error wenn neue URL kommt
  useEffect(() => {
    ZSerror(null);
  }, [mp4Url]);

  // Socket Events
  useEffect(() => {
    const handlePlayerState = (state: { playing: boolean, time: number }) => {
      setPlaying(state.playing);
      if (playerRef.current) {
        const currentParams = playerRef.current.getCurrentTime();
        if (Math.abs(currentParams - state.time) > 1) { // Toleranz auf 1s erhöht
          playerRef.current.seekTo(state.time, 'seconds');
        }
      }
    };

    socket.on('player_state', handlePlayerState);

    socket.on('player_seek', (time: number) => {
      if (playerRef.current) {
        playerRef.current.seekTo(time, 'seconds');
      }
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
          setPlaying(true);
        }
      }, 1000);
    });

    return () => {
      socket.off('player_state', handlePlayerState);
      socket.off('player_seek');
      socket.off('start_countdown');
    };
  }, [socket]);

  const handlePlay = () => {
    // Nur senden, wenn wir nicht schon spielen
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

  // UI States
  if (!url) {
    return (
      <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-gray-500 border border-white/10">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-1">Kein Video</h3>
          <p className="text-sm">Füge einen Link hinzu</p>
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="player-container w-full aspect-video bg-black rounded-xl flex items-center justify-center text-[#00f2ea] border border-white/10">
        <div className="text-center animate-pulse">
          <h3 className="text-lg font-bold mb-1">🚀 Lade Video...</h3>
          <p className="text-xs text-gray-400">Hole MP4 Stream</p>
        </div>
      </div>
    );
  }

  return (
    <div className="player-container w-full bg-black relative flex flex-col group rounded-xl overflow-hidden shadow-2xl border border-white/10">

      {/* Video Area */}
      <div className="relative aspect-[9/16] md:aspect-video bg-black flex justify-center items-center overflow-hidden">
        {mp4Url ? (
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
            onError={(e) => {
              console.error("Player Error:", e);
              ZSerror("Wiedergabe blockiert. Versuche anderen Link.");
            }}
            // 🔥 DER WICHTIGE FIX: REFERRER POLICY 🔥
            config={{
              file: {
                attributes: {
                  referrerPolicy: "no-referrer",
                  crossOrigin: "anonymous",
                  playsInline: true
                },
                forceVideo: true // Zwingt HTML5 Video Tag
              }
            }}
            style={{ maxHeight: '75vh' }}
          />
        ) : (
          <div className="text-red-500 text-sm">❌ URL konnte nicht geladen werden</div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <p className="text-red-400 font-bold px-4 text-center">{error}</p>
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
            className="text-white hover:text-[#00f2ea] disabled:opacity-30 transition-colors font-bold text-sm">
            ⏮ PREV
          </button>
          <button
            onClick={onNext}
            disabled={currentIndex === totalVideos - 1}
            className="text-white hover:text-[#00f2ea] disabled:opacity-30 transition-colors font-bold text-sm">
            NEXT ⏭
          </button>
        </div>

        <div className="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">
          CLIP {currentIndex + 1} / {totalVideos}
        </div>

        <div>
          <button
            onClick={handleSyncRequest}
            className="bg-[#ff0050] hover:bg-[#d60043] text-white text-xs font-bold py-1.5 px-3 rounded transition-transform active:scale-95 shadow-lg shadow-red-900/20">
            SYNC (3-2-1)
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;