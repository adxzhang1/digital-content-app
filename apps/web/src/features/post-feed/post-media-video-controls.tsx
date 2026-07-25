import { useEffect, useState } from "react";
import styles from "./post-feed.module.css";
import type { RefObject } from "react";

export type VideoDimensions = {
  height: number;
  width: number | null;
};

function formatVideoTime(time: number) {
  if (!Number.isFinite(time) || time < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(time);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatVideoDimensions(dimensions: VideoDimensions) {
  if (dimensions.width) {
    return `${dimensions.width}x${dimensions.height}`;
  }

  return `${dimensions.height}p`;
}

function VideoPlaybackInfo({
  videoDimensions,
  videoRef,
}: {
  videoDimensions: VideoDimensions | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [videoTime, setVideoTime] = useState({
    currentTime: 0,
    duration: 0,
  });

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const updateVideoTime = () => {
      setVideoTime((currentTime) => {
        if (
          currentTime.currentTime === video.currentTime &&
          currentTime.duration === video.duration
        ) {
          return currentTime;
        }

        return {
          currentTime: video.currentTime,
          duration: video.duration,
        };
      });
    };

    updateVideoTime();
    video.addEventListener("durationchange", updateVideoTime);
    video.addEventListener("loadedmetadata", updateVideoTime);
    video.addEventListener("timeupdate", updateVideoTime);

    return () => {
      video.removeEventListener("durationchange", updateVideoTime);
      video.removeEventListener("loadedmetadata", updateVideoTime);
      video.removeEventListener("timeupdate", updateVideoTime);
    };
  }, [videoRef]);

  return (
    <span className={styles.videoTimestamp}>
      <span>
        {formatVideoTime(videoTime.currentTime)}
        {Number.isFinite(videoTime.duration) && videoTime.duration > 0
          ? ` / ${formatVideoTime(videoTime.duration)}`
          : ""}
      </span>
      {videoDimensions ? (
        <span className={styles.videoQuality}>
          {formatVideoDimensions(videoDimensions)}
        </span>
      ) : null}
    </span>
  );
}

export function VideoControlButton({
  videoDimensions,
  videoRef,
}: {
  videoDimensions: VideoDimensions | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [controlState, setControlState] = useState<{
    control: "pause" | "play";
    isVisible: boolean;
  }>({
    control: "pause",
    isVisible: false,
  });

  // Hide the transient play/pause icon after user interaction.
  useEffect(() => {
    if (!controlState.isVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setControlState((currentState) => ({
        ...currentState,
        isVisible: false,
      }));
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [controlState.isVisible, controlState.control]);

  function toggleVideoPlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play().catch(() => {});
      setControlState({
        control: "play",
        isVisible: true,
      });
      return;
    }

    video.pause();
    setControlState({
      control: "pause",
      isVisible: true,
    });
  }

  return (
    <button
      aria-label="Play or pause video"
      className={styles.videoOverlay}
      onClick={toggleVideoPlayback}
      type="button"
    >
      <span
        className={`${styles.videoControlIcon} ${
          controlState.isVisible ? styles.videoControlIconVisible : ""
        }`}
      >
        <span
          className={
            controlState.control === "play"
              ? styles.videoPlayIcon
              : styles.videoPauseIcon
          }
        />
      </span>
      <VideoPlaybackInfo
        videoDimensions={videoDimensions}
        videoRef={videoRef}
      />
    </button>
  );
}
