import React, { useState } from 'react';
import { socket } from '../socket';
import './StreamerSelector.css';

interface StreamerSelectorProps {
  roomId: string;
  userId: string;
  isStreamer: boolean;
  streamerId: string | null;
  isStreamMode: boolean;
}

export const StreamerSelector: React.FC<StreamerSelectorProps> = ({
  roomId,
  userId,
  isStreamer,
  streamerId,
  isStreamMode
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBecomeStreamer = async () => {
    setLoading(true);
    setError(null);

    try {
      socket.emit('request_streamer_role', {
        roomId,
        userId
      });
    } catch (err) {
      setError('Failed to become streamer');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="streamer-selector">
      {isStreamMode && streamerId && (
        <div className="streamer-info">
          <div className="live-badge">
            <span className="live-dot"></span>
            <span>🔴 LIVE</span>
          </div>
          <p className="streamer-text">
            {isStreamer ? (
              <>
                <strong>🎬 You are the Streamer</strong>
                <br />
                <small>Everyone sees your screen</small>
              </>
            ) : (
              <>
                <strong>👁️ Watching {streamerId}'s Screen</strong>
                <br />
                <small>Screen Share Active (10 FPS)</small>
              </>
            )}
          </p>
        </div>
      )}

      {!isStreamer && !isStreamMode && (
        <button
          className="streamer-button"
          onClick={handleBecomeStreamer}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Setting up...
            </>
          ) : (
            <>
              🎬 Become Streamer
            </>
          )}
        </button>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default StreamerSelector;