export const TIKTOK_SCRIPT_URL = "https://www.tiktok.com/embed.js";

export const generateRoomId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const generateUserId = (): string => {
  return `User_${generateRoomId()}`;
};

export const getCurrentTime = (): string => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const validateTikTokUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('tiktok.com');
  } catch (e) {
    return false;
  }
};

export const truncateUrl = (url: string, maxLength: number = 40): string => {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
};