import React, { useState } from 'react';

// Adjusted to make isOpen optional or handled internally if used as a simple button
interface ShareModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  roomId: string;
}

// Changing this to a button that opens a modal, or just a simple button that copies.
// The previous simple version was just a button.
// The detailed version expects isOpen/onClose control from parent.
// Let's implement a self-contained version that manages its own state for simplicity in Header.

const ShareModal: React.FC<ShareModalProps> = ({ roomId, isOpen: externalIsOpen, onClose: externalOnClose }) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const onClose = externalOnClose || (() => setInternalIsOpen(false));
  const onOpen = () => setInternalIsOpen(true);

  const shareUrl = `${window.location.origin}/?room=${roomId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {!externalIsOpen && (
        <button onClick={onOpen} className="share-btn">
             Share Room
        </button>
      )}

      {isOpen && (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{
              background: '#1a1a1a', padding: '20px', borderRadius: '10px',
              border: '1px solid #333', minWidth: '300px'
          }}>
            <div className="flex justify-between items-center mb-6" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h2 className="text-xl font-bold" style={{ margin: 0 }}>Invite Friends</h2>
              <button onClick={onClose} className="btn btn-ghost p-2" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
            </div>

            <p className="text-muted mb-4" style={{ marginBottom: '15px', color: '#ccc' }}>
              Share this link with your friends to watch together in real-time!
            </p>

            <div className="flex gap-sm mb-6" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="input flex-1 text-sm font-mono bg-black/30"
                style={{ flex: 1, padding: '8px', background: '#000', border: '1px solid #333', color: 'white', borderRadius: '4px' }}
              />
              <button
                onClick={handleCopy}
                className={`btn ${copied ? 'btn-secondary' : 'btn-primary'}`}
                style={{ padding: '8px 16px', background: copied ? '#00f2ea' : '#fe2c55', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex justify-end" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ background: 'transparent', border: '1px solid #333', color: 'white', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShareModal;
