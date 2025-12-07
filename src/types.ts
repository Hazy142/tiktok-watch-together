export interface VideoItem {
  id: number;
  url: string;
  addedBy: string;
  addedAt: string;
  mp4Url?: string;
  isProcessing?: boolean;
}

export interface ChatMessage {
  id: number;
  user: string;
  text: string;
  timestamp: string;
  isSystem: boolean;
}

export interface RoomState {
  id: string;
  queue: VideoItem[];
  messages: ChatMessage[];
  currentVideoIndex: number;
}