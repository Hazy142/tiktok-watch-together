export interface VideoItem {
  id: number;
  url: string;
  addedBy: string;
  addedAt: string;
  mp4Url?: string;           // Extracted MP4 URL (if found)
  isProcessing?: boolean;    // Is extraction in progress?
  useScreenShare?: boolean;  // Should use screen share instead of MP4?
  extractionAttempted?: boolean; // Was extraction attempted?
}

export interface ChatMessage {
  id: number;
  user: string;
  text: string;
  timestamp: string;
  isSystem?: boolean;
}
