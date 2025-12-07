import React, { useState } from 'react';
import { VideoItem } from '../types';
import { validateTikTokUrl, truncateUrl } from '../constants';

interface PlaylistProps {
  queue: VideoItem[];
  currentIndex: number;
  onAddVideo: (url: string) => void;
  onRemoveVideo: (index: number) => void;
  onSelectVideo: (index: number) => void;
}

const Playlist: React.FC<PlaylistProps> = ({
  queue,
  currentIndex,
  onAddVideo,
  onRemoveVideo,
  onSelectVideo
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inputUrl.trim()) return;

    if (!validateTikTokUrl(inputUrl)) {
      setError('Invalid TikTok URL');
      return;
    }

    onAddVideo(inputUrl);
    setInputUrl('');
  };

  return (
    <div className="playlist-container glass">
      <div className="playlist-header">
        <h3 className="text-lg mb-2">Playlist</h3>
        <form onSubmit={handleAdd} className="flex gap-sm">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste TikTok URL..."
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      <div className="playlist-items custom-scrollbar">
        {queue.length === 0 ? (
          <div className="text-center text-muted py-8">
            Queue is empty
          </div>
        ) : (
          queue.map((video, index) => (
            <div
              key={video.id}
              className={`playlist-item ${index === currentIndex ? 'active' : ''}`}
              onClick={() => onSelectVideo(index)}
            >
              <div className="flex-1 overflow-hidden">
                <div className="font-medium truncate">
                  {truncateUrl(video.url, 50)}
                </div>
                <div className="text-sm text-muted flex justify-between mt-1">
                  <span>{video.addedBy}</span>
                  <span>{video.addedAt}</span>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveVideo(index);
                }}
                className="btn btn-ghost p-2 text-muted hover:text-red-500"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Playlist;