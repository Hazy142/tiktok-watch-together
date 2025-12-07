import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from './SocketContext';
import { Message } from '../types';

interface ChatContextType {
  messages: Message[];
  addMessage: (message: Message) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on('chat_message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('user_joined', (data) => {
        const sysMsg: Message = {
            id: 'sys-' + Date.now(),
            userId: 'System',
            text: `User joined. Total: ${data.totalUsers}`,
            timestamp: Date.now(),
            system: true
        };
        setMessages(prev => [...prev, sysMsg]);
    });

    socket.on('user_left', (data) => {
        const sysMsg: Message = {
            id: 'sys-' + Date.now(),
            userId: 'System',
            text: `User left. Total: ${data.totalUsers}`,
            timestamp: Date.now(),
            system: true
        };
        setMessages(prev => [...prev, sysMsg]);
    });

    return () => {
      socket.off('chat_message');
      socket.off('user_joined');
      socket.off('user_left');
    };
  }, [socket]);

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };

  return (
    <ChatContext.Provider value={{ messages, addMessage }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
