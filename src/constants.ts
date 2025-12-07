export const generateRoomId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const generateUserId = (): string => {
  return `User_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
};

export const getCurrentTime = (): string => {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// ✅ FIX: Proper URL validation & sanitization
export const validateTikTokUrl = (url: string): boolean => {
  if (!url) return false;
  
  // Remove whitespace
  url = url.trim();
  
  // Check if it's a TikTok URL
  return url.includes('tiktok.com') && url.includes('/video/');
};

// ✅ NEW: Sanitize & normalize TikTok URLs
export const sanitizeTikTokUrl = (url: string): string => {
  // Remove whitespace
  url = url.trim();
  
  // If it's already been concatenated, split and take the first one
  if (url.includes('https://www.tiktok.com') && url.lastIndexOf('https://www.tiktok.com') > 0) {
    url = url.substring(url.lastIndexOf('https://www.tiktok.com'));
  }
  
  // Remove query parameters that can break extraction
  const baseUrl = url.split('?')[0];
  
  // Add required params for server scraping
  // Remove embed_source and other problematic params
  let cleanUrl = baseUrl.split('?')[0];
  
  // Ensure it ends properly (no trailing slash)
  cleanUrl = cleanUrl.replace(/\/$/, '');
  
  return cleanUrl;
};

export const truncateUrl = (url: string, length: number = 50): string => {
  if (url.length <= length) return url;
  return url.substring(0, length) + '...';
};

export const TIKTOK_SCRIPT_URL = 'https://www.tiktok.com/embed.js';
