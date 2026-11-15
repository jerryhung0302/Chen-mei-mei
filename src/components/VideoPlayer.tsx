import { Film } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  poster?: string;
  title?: string;
  className?: string;
}

function getYoutubeEmbedUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (parsed.pathname.startsWith('/shorts/')) {
        const shortId = parsed.pathname.split('/shorts/')[1]?.split('/')[0];
        if (shortId) return `https://www.youtube.com/embed/${shortId}`;
      }
    }
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoPlayer({ url, poster, title, className = '' }: VideoPlayerProps) {
  if (!url) {
    return (
      <div className={`flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 ${className}`}>
        <Film className="w-7 h-7 mb-2 opacity-60" />
        <span className="text-xs">尚未設定商品影片</span>
      </div>
    );
  }

  const youtubeEmbed = getYoutubeEmbedUrl(url);
  if (youtubeEmbed) {
    return (
      <iframe
        src={youtubeEmbed}
        title={title || '商品介紹影片'}
        className={`w-full h-full border-0 ${className}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <video
      key={url}
      src={url}
      poster={poster}
      controls
      playsInline
      preload="metadata"
      className={`w-full h-full object-cover bg-zinc-950 ${className}`}
    >
      您的瀏覽器不支援 HTML5 影片播放。
    </video>
  );
}
