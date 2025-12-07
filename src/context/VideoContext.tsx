import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from './SocketContext';
import { Video } from '../types';

interface VideoContextType {
  currentVideo: Video | null;
  playlist: Video[];
  isPlaying: boolean;
  addVideo: (video: Video) => void;
  setCurrentVideo: (video: Video) => void;
  setIsPlaying: (playing: boolean) => void;
  seekTo: (time: number) => void;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export const VideoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentVideo, setCurrentVideoState] = useState<Video | null>(null);
  const [playlist, setPlaylist] = useState<Video[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on('sync_video', (data: { url: string, timestamp: number }) => {
        // Find video in playlist or create temporary one
        const video = {
            id: 'sync-' + Date.now(),
            url: data.url
        };
        setCurrentVideoState(video);
        setIsPlaying(true);
    });

    socket.on('playlist_add', (video: Video) => {
        setPlaylist(prev => [...prev, video]);
    });

    socket.on('player_play', () => setIsPlaying(true));
    socket.on('player_pause', () => setIsPlaying(false));

    return () => {
        socket.off('sync_video');
        socket.off('playlist_add');
        socket.off('player_play');
        socket.off('player_pause');
    };
  }, [socket]);

  const addVideo = (video: Video) => {
    setPlaylist(prev => [...prev, video]);
  };

  const setCurrentVideo = (video: Video) => {
    setCurrentVideoState(video);
    // Notify server
    if (socket) {
        socket.emit('sync_video', { url: video.url, roomId: 'TODO' }); // SocketContext handles roomId, but we need it here?
        // Ideally emit 'sync_video' with roomId.
        // We can get roomId from SocketContext, but we are inside the component tree.
    }
  };

  // We need to access roomId from useSocket inside the context provider...
  // Wait, VideoProvider is inside SocketProvider. So we can use useSocket().

  const { roomId } = useSocket();

  const handleSetCurrentVideo = (video: Video) => {
      setCurrentVideoState(video);
      socket?.emit('sync_video', { roomId, url: video.url });
  };

  const seekTo = (time: number) => {
      // socket.emit('seek', time);
  };

  return (
    <VideoContext.Provider value={{
      currentVideo,
      playlist,
      isPlaying,
      addVideo,
      setCurrentVideo: handleSetCurrentVideo,
      setIsPlaying,
      seekTo
    }}>
      {children}
    </VideoContext.Provider>
  );
};

export const useVideo = () => {
  const context = useContext(VideoContext);
  if (context === undefined) {
    throw new Error('useVideo must be used within a VideoProvider');
  }
  return context;
};
