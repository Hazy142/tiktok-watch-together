import React, { useState } from 'react';
import { useVideo } from '../context/VideoContext';
import { useSocket } from '../context/SocketContext';
import { Video } from '../types';

interface PlaylistProps {
    queue?: any[]; // For compatibility
    currentIndex?: number;
    onAddVideo?: (url: string) => void;
    onRemoveVideo?: (index: number) => void;
    onSelectVideo?: (index: number) => void;
}

const Playlist: React.FC<PlaylistProps> = (props) => {
  const { playlist, addVideo, currentVideo, setCurrentVideo } = useVideo();
  const { socket, roomId } = useSocket();
  const [urlInput, setUrlInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsAdding(true);
    
    const video: Video = {
        id: Math.random().toString(36).substr(2, 9),
        url: urlInput,
        title: 'TikTok Video'
    };

    socket?.emit('playlist_add', { roomId, video });
    addVideo(video);

    setUrlInput('');
    setIsAdding(false);
  };

  return (
    <div className="playlist-container glass">
      <div className="p-4 border-b border-[var(--border)]">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>🎵</span> Playlist
          <span className="text-sm font-normal text-muted ml-auto">
            {playlist.length} videos
          </span>
        </h3>
      </div>

      <div className="p-4 border-b border-[var(--border)]">
        <form onSubmit={handleSubmit} className="flex gap-sm">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste TikTok URL..."
            className="input flex-1"
            disabled={isAdding}
          />
          <button
            type="submit"
            className="btn btn-primary whitespace-nowrap"
            disabled={isAdding}
          >
            {isAdding ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      <div className="playlist-items custom-scrollbar">
        {playlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted opacity-50">
            <span className="text-2xl mb-2">📺</span>
            <p>Queue is empty</p>
          </div>
        ) : (
          playlist.map((video, index) => (
            <div
              key={video.id}
              className={`playlist-item ${currentVideo?.id === video.id ? 'active' : ''}`}
              onClick={() => setCurrentVideo(video)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate mb-1">
                  {video.url}
                </div>
                <div className="text-xs text-muted flex items-center gap-2">
                  <span>ID: {video.id}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Playlist;
