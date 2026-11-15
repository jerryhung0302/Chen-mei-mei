import { useEffect, useState } from 'react';
import { AlertCircle, Film } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  poster?: string;
  title?: string;
  className?: string;
  fit?: 'cover' | 'contain';
  onReady?: (durationSeconds?: number) => void;
  onError?: () => void;
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

export function VideoPlayer({
  url,
  poster,
  title,
  className = '',
  fit = 'cover',
  onReady,
  onError
}: VideoPlayerProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [url]);

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
        onLoad={() => onReady?.()}
      />
    );
  }

  if (hasError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-zinc-900 text-zinc-300 px-4 text-center ${className}`}>
        <AlertCircle className="w-7 h-7 mb-2 text-amber-400" />
        <span className="text-xs font-medium">此影片無法於目前瀏覽器播放或路徑無效</span>
        <span className="text-[11px] text-zinc-400 mt-1 break-all max-w-sm">{url}</span>
      </div>
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
      onLoadedMetadata={(e) => onReady?.(e.currentTarget.duration)}
      onError={() => {
        setHasError(true);
        onError?.();
      }}
      className={`w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} bg-zinc-950 ${className}`}
    >
      您的瀏覽器不支援 HTML5 影片播放。
    </video>
  );
}

