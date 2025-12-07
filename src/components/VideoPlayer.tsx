import React from 'react';
import ReactPlayer from 'react-player';
import { useVideo } from '../context/VideoContext';
import { useSocket } from '../context/SocketContext';
import StreamViewer from './StreamViewer';

interface VideoPlayerProps {
    url?: string;
    currentIndex?: number;
    totalVideos?: number;
    onNext?: () => void;
    onPrev?: () => void;
    onEnded?: () => void;
    isPlaying?: boolean;
    onPlayPause?: (playing: boolean) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = (props) => {
  const { currentVideo, isPlaying, setIsPlaying } = useVideo();
  const { socket, roomId } = useSocket();

  if (!currentVideo) {
      return (
          <div className="video-player-container">
              <h3>Screen Share Mode</h3>
              <StreamViewer />
          </div>
      );
  }

  // Use type assertion to silence the error
  const Player = ReactPlayer as any;

  return (
    <div className="video-player-container">
      <Player
        url={currentVideo.url}
        playing={isPlaying}
        controls={true}
        width="100%"
        height="100%"
        onPlay={() => {
            setIsPlaying(true);
            socket?.emit('player_play', { roomId });
        }}
        onPause={() => {
            setIsPlaying(false);
            socket?.emit('player_pause', { roomId });
        }}
      />
    </div>
  );
};

export default VideoPlayer;
