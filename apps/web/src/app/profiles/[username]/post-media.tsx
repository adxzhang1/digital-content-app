import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";
import { ScrollSnapCarousel } from "@/features/feed/scroll-snap-carousel";
import styles from "./post-feed-viewer.module.css";
import type {
  ProfilePostDetail,
  ProfilePostSummary,
} from "@/features/profile/profile-data";

type FeedMediaItem = {
  id: string;
  sources?: {
    hls?: {
      url?: string;
    };
  };
  type: string;
  url?: string;
};

type PostMediaProps = {
  isActive: boolean;
  isImageCover: boolean;
  post: ProfilePostSummary;
  resolvedPost: ProfilePostDetail | ProfilePostSummary;
};

const getPostMediaItems = (
  summaryPost: ProfilePostSummary,
  resolvedPost: ProfilePostDetail | ProfilePostSummary
) => {
  if ("media" in resolvedPost) {
    const thumbnail = summaryPost.thumbnail;

    return [...resolvedPost.media]
      .filter((item) => item.url || item.sources?.hls?.url)
      .sort((left, right) => left.position - right.position)
      .map((item) => {
        const matchesThumbnail =
          thumbnail?.url &&
          (item.mediaId === thumbnail.mediaId ||
            item.position === thumbnail.position);

        return matchesThumbnail ? { ...item, url: thumbnail.url } : item;
      });
  }

  return summaryPost.thumbnail?.url ? [summaryPost.thumbnail] : [];
};

const MediaItem = memo(function MediaItem({
  isActive,
  isImageCover,
  preload,
  sources,
  type,
  url,
}: {
  isActive: boolean;
  isImageCover: boolean;
  preload: boolean;
  sources?: FeedMediaItem["sources"];
  type: string;
  url?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const displayUrl = url;
  const activeVideoUrl =
    type === "VIDEO" && isActive ? sources?.hls?.url : undefined;
  const [videoState, setVideoState] = useState<{
    control: "pause" | "play";
    controlVisible: boolean;
    isReady: boolean;
    shouldMount: boolean;
    url?: string;
  }>({
    control: "pause",
    controlVisible: false,
    isReady: false,
    shouldMount: false,
  });
  const isCurrentVideo = Boolean(
    activeVideoUrl && videoState.url === activeVideoUrl
  );
  const shouldMountVideo = isCurrentVideo && videoState.shouldMount;
  const isVideoReady = isCurrentVideo && videoState.isReady;

  useEffect(() => {
    if (!preload || !displayUrl) {
      return;
    }

    const image = new Image();
    image.src = displayUrl;
    void image.decode().catch(() => {});
  }, [displayUrl, preload]);

  useEffect(() => {
    if (!activeVideoUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVideoState({
        control: "pause",
        controlVisible: false,
        isReady: false,
        shouldMount: true,
        url: activeVideoUrl,
      });
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeVideoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    const videoUrl = activeVideoUrl;

    if (!shouldMountVideo || !video || !videoUrl) {
      return;
    }

    let hls: Hls | undefined;
    const markVideoReady = () => {
      const revealVideo = () => {
        window.requestAnimationFrame(() => {
          setVideoState((currentState) =>
            currentState.url === videoUrl
              ? {
                  ...currentState,
                  isReady: true,
                }
              : currentState
          );
        });
      };

      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(revealVideo);
        return;
      }

      revealVideo();
    };
    const playVideo = () => {
      void video.play().catch(() => {});
    };
    const loadVideo = () => {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.addEventListener("playing", markVideoReady, { once: true });
        video.addEventListener("loadedmetadata", playVideo, { once: true });
        video.src = videoUrl;
        return;
      }

      if (!Hls.isSupported()) {
        return;
      }

      hls = new Hls();
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls?.loadSource(videoUrl);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        playVideo();
      });
      video.addEventListener("playing", markVideoReady, { once: true });
      hls.attachMedia(video);
    };

    loadVideo();

    return () => {
      hls?.destroy();
      video.removeEventListener("playing", markVideoReady);
      video.removeEventListener("loadedmetadata", playVideo);
      video.removeAttribute("src");
    };
  }, [activeVideoUrl, shouldMountVideo]);

  useEffect(() => {
    if (!videoState.controlVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVideoState((currentState) => ({
        ...currentState,
        controlVisible: false,
      }));
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [videoState.controlVisible, videoState.control]);

  function toggleVideoPlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play().catch(() => {});
      setVideoState((currentState) => ({
        ...currentState,
        control: "play",
        controlVisible: true,
      }));
      return;
    }

    video.pause();
    setVideoState((currentState) => ({
      ...currentState,
      control: "pause",
      controlVisible: true,
    }));
  }

  if (!displayUrl) {
    return null;
  }

  const mediaClassName = isImageCover
    ? `${styles.modalImage} ${styles.modalImageCover}`
    : styles.modalImage;

  if (type === "VIDEO") {
    return (
      <>
        <img
          alt=""
          className={`${mediaClassName} ${
            isVideoReady ? styles.videoImageHidden : ""
          }`}
          decoding="async"
          draggable={false}
          fetchPriority={preload ? "high" : "auto"}
          loading={preload ? "eager" : "lazy"}
          src={displayUrl}
        />
        {shouldMountVideo && sources?.hls?.url ? (
          <>
            <video
              autoPlay
              className={`${mediaClassName} ${
                isVideoReady ? "" : styles.videoLoading
              }`}
              playsInline
              preload="metadata"
              ref={videoRef}
            />
            <button
              aria-label="Play or pause video"
              className={styles.videoOverlay}
              onClick={toggleVideoPlayback}
              type="button"
            >
              <span
                className={`${styles.videoControlIcon} ${
                  videoState.controlVisible ? styles.videoControlIconVisible : ""
                }`}
              >
                <span
                  className={
                    videoState.control === "play"
                      ? styles.videoPlayIcon
                      : styles.videoPauseIcon
                  }
                />
              </span>
            </button>
          </>
        ) : null}
      </>
    );
  }

  return (
    <img
      alt=""
      className={mediaClassName}
      decoding="async"
      draggable={false}
      fetchPriority={preload ? "high" : "auto"}
      loading={preload ? "eager" : "lazy"}
      src={displayUrl}
    />
  );
});

export function PostMedia({
  isActive,
  isImageCover,
  post,
  resolvedPost,
}: PostMediaProps) {
  const mediaItems = useMemo(
    () =>
      getPostMediaItems(post, resolvedPost).map((item) => ({
        id: item.mediaId,
        sources: item.sources,
        type: item.type,
        url: item.url,
      })),
    [post, resolvedPost]
  );
  const singleMediaItem =
    post.mediaCount <= 1 && mediaItems.length === 1
      ? mediaItems[0]
      : undefined;
  const renderCarouselItem = useCallback(
    (item: FeedMediaItem, { isPriority }: { isPriority: boolean }) => (
      <MediaItem
        isActive={isActive}
        isImageCover={isImageCover}
        preload={isActive && isPriority}
        sources={item.sources}
        type={item.type}
        url={item.url}
      />
    ),
    [isActive, isImageCover]
  );

  if (mediaItems.length === 0) {
    return null;
  }

  if (singleMediaItem) {
    return (
      <MediaItem
        isActive={isActive}
        isImageCover={isImageCover}
        preload={isActive}
        sources={singleMediaItem.sources}
        type={singleMediaItem.type}
        url={singleMediaItem.url}
      />
    );
  }

  return (
    <ScrollSnapCarousel
      items={mediaItems}
      renderItem={renderCarouselItem}
    />
  );
}
