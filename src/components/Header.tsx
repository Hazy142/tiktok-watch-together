import React from 'react';
import ShareModal from './ShareModal';

interface HeaderProps {
  roomId: string;
  onNewRoom?: () => void;
  onShare?: () => void;
}

const Header: React.FC<HeaderProps> = ({ roomId, onNewRoom, onShare }) => {
  return (
    <header className="header">
      <div className="logo">
        <h1>🎵 TikTok Watch Together</h1>
      </div>
      <div className="room-info">
        <span>Room: {roomId}</span>
        <ShareModal roomId={roomId} />
      </div>
    </header>
  );
};

export default Header;
