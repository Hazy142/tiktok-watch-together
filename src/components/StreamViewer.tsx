import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

interface StreamViewerProps {
    roomId?: string;
    streamerId?: string;
    isStreamMode?: boolean;
}

const StreamViewer: React.FC<StreamViewerProps> = (props) => {
  const { socket } = useSocket();
  const [frameData, setFrameData] = useState<string | null>(null);
  const [streamerId, setStreamerId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleStreamFrame = (data: { frameData: string, streamerId: string, timestamp: number }) => {
        // console.log('Frame received', data.timestamp);
        setFrameData(data.frameData);
        setStreamerId(data.streamerId);
    };

    socket.on('stream_frame', handleStreamFrame);

    return () => {
      socket.off('stream_frame', handleStreamFrame);
    };
  }, [socket]);

  if (!frameData) {
    return (
        <div className="stream-placeholder" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%',
            color: '#666'
        }}>
            <div style={{ fontSize: '48px', marginBottom: '15px' }}>📺</div>
            <p>Waiting for streamer...</p>
        </div>
    );
  }

  return (
    <div className="stream-viewer" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <img
        ref={imgRef}
        src={frameData}
        alt="Live stream"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
      <div className="stream-info" style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(0,0,0,0.5)', padding: '5px 10px', borderRadius: '4px', fontSize: '12px'
      }}>
        Streamer: {streamerId}
      </div>
    </div>
  );
};

export default StreamViewer;
