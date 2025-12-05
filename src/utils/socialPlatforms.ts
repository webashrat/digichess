export const socialPlatforms = [
  { name: 'Facebook', icon: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg' },
  { name: 'Instagram', icon: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png' },
  { name: 'Twitter (X)', icon: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/X_icon_2023.svg' },
  { name: 'YouTube', icon: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/YouTube_Icon.svg' },
  { name: 'TikTok', icon: 'https://upload.wikimedia.org/wikipedia/en/a/a9/TikTok_logo.svg' },
  { name: 'Snapchat', icon: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Snapchat_logo.svg' },
  { name: 'LinkedIn', icon: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png' },
  { name: 'Reddit', icon: 'https://upload.wikimedia.org/wikipedia/en/5/58/Reddit_logo_new.svg' },
  { name: 'Pinterest', icon: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Pinterest_icon.svg' },
  { name: 'Discord', icon: 'https://upload.wikimedia.org/wikipedia/en/9/98/Discord_logo.svg' },
  { name: 'Telegram', icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg' },
  { name: 'WhatsApp', icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg' },
  { name: 'Twitch', icon: 'https://upload.wikimedia.org/wikipedia/commons/d/d3/Twitch_Glitch_Logo_Purple.svg' },
  { name: 'Spotify', icon: 'https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg' },
  { name: 'GitHub', icon: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg' },
  { name: 'Medium', icon: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Medium_logo_Monogram.svg' },
  { name: 'Quora', icon: 'https://upload.wikimedia.org/wikipedia/commons/4/4f/Quora_icon.svg' },
  { name: 'Threads', icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Threads_(app)_logo.svg' },
  { name: 'Custom', icon: '' }
];

export const detectPlatform = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('facebook')) return 'Facebook';
  if (lower.includes('twitter') || lower.includes('x.com')) return 'Twitter (X)';
  if (lower.includes('youtube')) return 'YouTube';
  if (lower.includes('tiktok')) return 'TikTok';
  if (lower.includes('snapchat')) return 'Snapchat';
  if (lower.includes('linkedin')) return 'LinkedIn';
  if (lower.includes('reddit')) return 'Reddit';
  if (lower.includes('pinterest')) return 'Pinterest';
  if (lower.includes('discord')) return 'Discord';
  if (lower.includes('telegram')) return 'Telegram';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('twitch')) return 'Twitch';
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('github')) return 'GitHub';
  if (lower.includes('medium')) return 'Medium';
  if (lower.includes('quora')) return 'Quora';
  if (lower.includes('threads')) return 'Threads';
  return 'Custom';
};
