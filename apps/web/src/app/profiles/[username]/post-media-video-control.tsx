import { useEffect, useState } from "react";
import styles from "./post-feed-viewer.module.css";
import type { RefObject } from "react";

export function VideoControlButton({
  videoRef,
}: {
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
    </button>
  );
}
