import React from 'react';
import './StreamerSelector.css';

interface StreamerSelectorProps {
    roomId?: string;
    userId?: string;
    isStreamer?: boolean;
    streamerId?: string;
    isStreamMode?: boolean;
}

const StreamerSelector: React.FC<StreamerSelectorProps> = () => {
    return (
        <div className="streamer-selector">
            <h4>Active Streamers</h4>
            <div className="streamer-list">
                <div className="streamer-item">
                    <span className="streamer-name">No active streamers</span>
                </div>
            </div>
        </div>
    );
};

export default StreamerSelector;
