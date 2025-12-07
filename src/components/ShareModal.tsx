import React, { useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, roomId }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Invite Friends</h2>
          <button onClick={onClose} className="btn btn-ghost p-2">✕</button>
        </div>

        <p className="text-muted mb-4">
          Share this link with your friends to watch together in real-time!
        </p>

        <div className="flex gap-sm mb-6">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="input flex-1 text-sm font-mono bg-black/30"
          />
          <button
            onClick={handleCopy}
            className={`btn ${copied ? 'btn-secondary' : 'btn-primary'}`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;