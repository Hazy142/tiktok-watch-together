import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface ChatProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUserId: string;
}

const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, currentUserId }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="chat-container glass">
      <div className="p-4 border-b border-[var(--border)]">
        <h3 className="text-lg font-bold">Live Chat</h3>
      </div>

      <div className="chat-messages custom-scrollbar">
        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="message system">
                {msg.text}
              </div>
            );
          }

          const isOwn = msg.user === currentUserId;

          return (
            <div
              key={msg.id}
              className={`message ${isOwn ? 'own' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className={`text-xs font-bold ${isOwn ? 'text-primary' : 'text-secondary'}`}>
                  {isOwn ? 'You' : msg.user}
                </span>
                <span className="text-[10px] text-muted opacity-70">
                  {msg.timestamp}
                </span>
              </div>
              <p className="text-sm break-words leading-relaxed">{msg.text}</p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form onSubmit={handleSubmit} className="flex gap-sm">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary px-4">
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default Chat;