export interface Video {
  id: string;
  url: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
}

export interface Message {
  id: string;
  userId: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
}
