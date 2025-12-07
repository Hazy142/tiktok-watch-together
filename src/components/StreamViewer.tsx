import React, { useEffect, useState, useRef } from 'react';
import { socket } from '../socket';
import './StreamViewer.css';

interface StreamViewerProps {
  roomId: string;
  streamerId: string | null;
  isStreamMode: boolean;
}

export const StreamViewer: React.FC<StreamViewerProps> = ({
  roomId,
  streamerId,
  isStreamMode
}) => {
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [frameTimestamp, setFrameTimestamp] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [latency, setLatency] = useState<number>(0);
  const fpsCounterRef = useRef({ frames: 0, lastTime: Date.now() });
  const frameTimestampRef = useRef<number>(0);

  useEffect(() => {
    if (!isStreamMode || !streamerId) return;

    const handleStreamFrame = (data: { data: string; timestamp: number }) => {
      const now = Date.now();
      const frameLatency = now - data.timestamp;
      setLatency(Math.max(0, frameLatency));
      setCurrentFrame(data.data);
      setFrameTimestamp(data.timestamp);
      frameTimestampRef.current = data.timestamp;

      // FPS Counter
      fpsCounterRef.current.frames++;
      const elapsed = now - fpsCounterRef.current.lastTime;
      if (elapsed >= 1000) {
        setFps(Math.round((fpsCounterRef.current.frames * 1000) / elapsed));
        fpsCounterRef.current = { frames: 0, lastTime: now };
      }
    };

    socket.on('stream_frame', handleStreamFrame);

    return () => {
      socket.off('stream_frame', handleStreamFrame);
    };
  }, [isStreamMode, streamerId]);

  if (!isStreamMode || !streamerId || !currentFrame) {
    return (
      <div className="stream-viewer-loading">
        <div className="loading-spinner"></div>
        <p>Waiting for stream from {streamerId}...</p>
      </div>
    );
  }

  return (
    <div className="stream-viewer-container">
      <div className="stream-display">
        <img
          src={currentFrame}
          alt="Streamer Screen"
          className="stream-image"
        />
        
        {/* Stats Overlay */}
        <div className="stream-stats">
          <div className="stat-item">
            <span className="stat-label">FPS:</span>
            <span className="stat-value">{fps}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Latency:</span>
            <span className="stat-value">{latency}ms</span>
          </div>
        </div>

        {/* Streamer Badge */}
        <div className="streamer-badge">
          <span className="badge-dot"></span>
          <span className="badge-text">🎬 {streamerId}'s Screen</span>
        </div>
      </div>

      {/* Info Footer */}
      <div className="stream-info-footer">
        <p className="info-text">
          Screen Share Active • {fps} FPS • {latency}ms latency
        </p>
      </div>
    </div>
  );
};

export default StreamViewer;