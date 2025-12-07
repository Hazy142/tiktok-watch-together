import React from 'react';

interface HeaderProps {
  roomId: string;
  onNewRoom: () => void;
  onShare: () => void;
}

const Header: React.FC<HeaderProps> = ({ roomId, onNewRoom, onShare }) => {
  return (
    <header className="header flex items-center justify-between">
      <div className="flex items-center gap-md">
        <div className="logo-text">WatchTogether</div>
        <div className="text-muted text-sm hidden lg:block">
          Sync TikToks with friends
        </div>
      </div>

      <div className="flex items-center gap-md">
        <div className="glass px-4 py-2 rounded-full text-sm font-mono hidden sm:block">
          Room: <span className="text-primary">{roomId}</span>
        </div>

        <button onClick={onShare} className="btn btn-primary">
          <span>Invite Friends</span>
        </button>

        <button onClick={onNewRoom} className="btn btn-ghost text-sm">
          New Room
        </button>
      </div>
    </header>
  );
};

export default Header;