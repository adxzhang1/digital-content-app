"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Hls from "hls.js";
import styles from "./post-feed-viewer.module.css";
import {
  VideoControlButton,
  type VideoDimensions,
} from "./post-media-video-control";
import type { ReactNode } from "react";

export type ActiveVideo = {
  hlsUrl: string;
  mediaItemId: string;
  postId: string;
};

const PostMediaVideoReadyContext = createContext<string | null | undefined>(
  undefined,
);
const PostMediaVideoHostContext = createContext<
  ((postId: string, host: HTMLDivElement | null) => void) | null
>(null);

export function usePostMediaVideo() {
  const readyVideoItemId = useContext(PostMediaVideoReadyContext);

  if (readyVideoItemId === undefined) {
    throw new Error(
      "usePostMediaVideo must be used inside PostMediaVideoManager.",
    );
  }

  return { readyVideoItemId };
}

function useVideoHostRegistration() {
  const registerVideoHost = useContext(PostMediaVideoHostContext);

  if (!registerVideoHost) {
    throw new Error("VideoHost must be used inside PostMediaVideoManager.");
  }

  return registerVideoHost;
}

export function PostMediaVideoManager({
  activeVideo,
  children,
  isImageCover,
}: {
  activeVideo: ActiveVideo | null;
  children: ReactNode;
  isImageCover: boolean;
}) {
  const [readyVideoItemId, setReadyVideoItemId] = useState<string | null>(null);
  const [videoHosts, setVideoHosts] = useState(
    () => new Map<string, HTMLDivElement>(),
  );

  const registerVideoHost = useCallback(
    (postId: string, host: HTMLDivElement | null) => {
      setVideoHosts((currentHosts) => {
        const nextHosts = new Map(currentHosts);

        if (host) {
          nextHosts.set(postId, host);
        } else {
          nextHosts.delete(postId);
        }

        return nextHosts;
      });
    },
    [],
  );
  const activeHost = activeVideo
    ? (videoHosts.get(activeVideo.postId) ?? null)
    : null;

  return (
    <PostMediaVideoHostContext.Provider value={registerVideoHost}>
      <PostMediaVideoReadyContext.Provider value={readyVideoItemId}>
        {children}
        <VideoManager
          activeHost={activeHost}
          activeVideo={activeVideo}
          isImageCover={isImageCover}
          onReadyVideoItemChange={setReadyVideoItemId}
        />
      </PostMediaVideoReadyContext.Provider>
    </PostMediaVideoHostContext.Provider>
  );
}

export const VideoHost = memo(function VideoHost({
  postId,
}: {
  postId: string;
}) {
  const registerVideoHost = useVideoHostRegistration();
  const handleHostChange = useCallback(
    (host: HTMLDivElement | null) => {
      registerVideoHost(postId, host);
    },
    [postId, registerVideoHost],
  );

  return <div className={styles.videoHost} ref={handleHostChange} />;
});

// Manages one reusable video node to avoid play rejections from remounting videos.
const VideoManager = memo(function VideoManager({
  activeHost,
  activeVideo,
  isImageCover,
  onReadyVideoItemChange,
}: {
  activeHost: HTMLDivElement | null;
  activeVideo: ActiveVideo | null;
  isImageCover: boolean;
  onReadyVideoItemChange: (itemId: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const parkingHostRef = useRef<HTMLDivElement | null>(null);
  const hostedActiveVideo = activeVideo && activeHost ? activeVideo : null;
  const activeVideoUrl = activeVideo?.hlsUrl;
  const activeMediaItemId = activeVideo?.mediaItemId;
  const [readySource, setReadySource] = useState<{
    mediaItemId: string;
    videoUrl: string;
  } | null>(null);
  const [videoDimensions, setVideoDimensions] =
    useState<VideoDimensions | null>(null);
  const isVideoReady = Boolean(
    activeMediaItemId &&
      activeVideoUrl &&
      readySource?.mediaItemId === activeMediaItemId &&
      readySource.videoUrl === activeVideoUrl,
  );

  useLayoutEffect(() => {
    if (!videoRef.current) {
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.preload = "metadata";
      videoRef.current = video;
    }

    return () => {
      videoRef.current?.remove();
      videoRef.current = null;
    };
  }, []);

  // Move the video node into the active row host, or park it when unavailable.
  useLayoutEffect(() => {
    const video = videoRef.current;
    const parkingHost = parkingHostRef.current;
    const host = hostedActiveVideo ? activeHost : parkingHost;

    if (!video || !host || video.parentElement === host) {
      return;
    }

    host.appendChild(video);
  }, [activeHost, hostedActiveVideo]);

  // Report when this exact media item is ready to play.
  useEffect(() => {
    onReadyVideoItemChange(
      isVideoReady && activeMediaItemId ? activeMediaItemId : null,
    );
  }, [activeMediaItemId, isVideoReady, onReadyVideoItemChange]);

  // Attach the active HLS source, or reset the video when none is active.
  useEffect(() => {
    const video = videoRef.current;
    const mediaItemId = activeMediaItemId;
    const videoUrl = activeVideoUrl;

    if (!video) {
      return;
    }

    // Clear readiness before detaching or setting up the active video source.
    setReadySource(null);
    setVideoDimensions(null);

    // No active video means the shared node should be fully detached from media.
    if (!mediaItemId || !videoUrl) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }

    let didCancel = false;
    let hls: Hls | undefined;
    const updateVideoDimensions = (dimensions?: {
      height?: number;
      width?: number;
    }) => {
      const height = dimensions?.height;

      if (didCancel || !height) {
        return;
      }

      setVideoDimensions({
        height,
        width: dimensions.width || null,
      });
    };
    const markVideoReady = () => {
      // Wait for an actual decoded frame when the browser exposes that signal.
      const revealVideo = () => {
        window.requestAnimationFrame(() => {
          if (didCancel) {
            return;
          }

          setReadySource({ mediaItemId, videoUrl });
        });
      };

      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(revealVideo);
        return;
      }

      revealVideo();
    };
    const playVideo = () => {
      if (didCancel) {
        return;
      }

      void video.play().catch(() => {});
    };
    const updateNativeVideoDimensions = () => {
      updateVideoDimensions({
        height: video.videoHeight,
        width: video.videoWidth,
      });
    };
    const setupVideo = () => {
      // Safari can play HLS directly without hls.js.
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.addEventListener("playing", markVideoReady, { once: true });
        video.addEventListener("loadedmetadata", playVideo, { once: true });
        video.addEventListener("loadedmetadata", updateNativeVideoDimensions);
        video.addEventListener("resize", updateNativeVideoDimensions);
        video.src = videoUrl;
        return;
      }

      // Other supported browsers need hls.js to attach the stream.
      if (!Hls.isSupported()) {
        return;
      }

      hls = new Hls();
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (didCancel) {
          return;
        }

        hls?.loadSource(videoUrl);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (didCancel) {
          return;
        }

        playVideo();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        updateVideoDimensions(hls?.levels[data.level]);
      });
      hls.on(Hls.Events.FRAG_CHANGED, (_, data) => {
        updateVideoDimensions(hls?.levels[data.frag.level]);
      });
      video.addEventListener("playing", markVideoReady, { once: true });
      hls.attachMedia(video);
    };

    setupVideo();

    return () => {
      // Stop old streams and make late async callbacks no-ops.
      didCancel = true;
      video.pause();
      hls?.destroy();
      video.removeEventListener("playing", markVideoReady);
      video.removeEventListener("loadedmetadata", playVideo);
      video.removeEventListener("loadedmetadata", updateNativeVideoDimensions);
      video.removeEventListener("resize", updateNativeVideoDimensions);
      video.removeAttribute("src");
      video.load();
    };
  }, [activeMediaItemId, activeVideoUrl]);

  const mediaClassName = isImageCover
    ? `${styles.mediaElement} ${styles.mediaElementCover}`
    : styles.mediaElement;
  const videoClassName =
    hostedActiveVideo
      ? `${mediaClassName} ${isVideoReady ? "" : styles.videoHiddenUntilReady}`
      : styles.parkedVideoElement;

  // Keep the imperatively managed video node visually in sync before paint.
  useLayoutEffect(() => {
    const video = videoRef.current;

    if (video) {
      video.className = videoClassName;
    }
  }, [videoClassName]);

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.videoParkingHost}
        ref={parkingHostRef}
      />
      {hostedActiveVideo && activeHost
        ? createPortal(
            <VideoControlButton
              videoDimensions={videoDimensions}
              videoRef={videoRef}
            />,
            activeHost,
          )
        : null}
    </>
  );
});
