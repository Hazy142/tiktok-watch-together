import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
  socket: Socket | null;
  roomId: string;
  isConnected: boolean;
  joinRoom: (roomId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode, roomId?: string }> = ({ children, roomId: initialRoomId }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>(initialRoomId || '');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket'],
      upgrade: false
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setSocket(newSocket);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (socket && roomId && isConnected) {
        socket.emit('join_room', {
            roomId,
            userId: 'user-' + Math.random().toString(36).substr(2, 5) // Temporary user ID
        });
    }
  }, [socket, roomId, isConnected]);

  const joinRoom = (id: string) => {
    setRoomId(id);
  };

  return (
    <SocketContext.Provider value={{ socket, roomId, isConnected, joinRoom }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
