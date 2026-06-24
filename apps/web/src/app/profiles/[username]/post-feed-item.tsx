"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, TouchEvent } from "react";
import styles from "./post-feed-viewer.module.css";
import type { ProfilePostDetail, ProfilePostSummary } from "./profile-data";

export type DeleteMode = "soft" | "force";

type DragPoint = {
  x: number;
  y: number;
};

export type PostFeedItemProps = {
  canManagePost: boolean;
  isImageCover: boolean;
  isDeletingPost: boolean;
  isActive: boolean;
  isLiked: boolean;
  isMenuOpen: boolean;
  likeCount: number;
  onDelete: (post: ProfilePostDetail, deleteMode?: DeleteMode) => void;
  onToggleImageFit: () => void;
  onLike: (postId: string) => void;
  onToggleMenu: (postId: string) => void;
  post: ProfilePostSummary;
  postError: string | null;
  resolvedPost: ProfilePostDetail | ProfilePostSummary;
  style: CSSProperties;
};

const DRAG_AXIS_LOCK_RATIO = 1.2;
const CAROUSEL_TRANSITION_MS = 200;
const DRAG_DISTANCE_RATIO = 0.14;
const DRAG_EDGE_RESISTANCE = 0.18;
const MAX_SWIPE_THRESHOLD = 96;

const formatCount = (value: number) => new Intl.NumberFormat("en").format(value);

const formatPostDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(length - 1, Math.max(0, index));

const getPostMediaItems = (
  summaryPost: ProfilePostSummary,
  resolvedPost: ProfilePostDetail | ProfilePostSummary
) => {
  if ("media" in resolvedPost) {
    const thumbnail = summaryPost.thumbnail;

    return [...resolvedPost.media]
      .filter((item) => item.url)
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

function PostMediaCarousel({
  isImageCover,
  isActivePost,
  post,
  resolvedPost,
}: {
  isImageCover: boolean;
  isActivePost: boolean;
  post: ProfilePostSummary;
  resolvedPost: ProfilePostDetail | ProfilePostSummary;
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const carouselSettleTimerRef = useRef<number | null>(null);
  const carouselTransitionFrameRef = useRef<number | null>(null);
  const carouselDragRef = useRef<DragPoint | null>(null);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [carouselDragOffset, setCarouselDragOffset] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [isCarouselDragging, setIsCarouselDragging] = useState(false);
  const [isCarouselTransitionDisabled, setIsCarouselTransitionDisabled] =
    useState(true);
  const mediaItems = useMemo(
    () => getPostMediaItems(post, resolvedPost),
    [post, resolvedPost]
  );
  const visibleCarouselIndex = Math.min(
    activeCarouselIndex,
    Math.max(mediaItems.length - 1, 0)
  );
  const carouselContentWidth =
    carouselWidth > 0
      ? `${mediaItems.length * carouselWidth}px`
      : "100%";
  const carouselTrackOffset =
    -(visibleCarouselIndex * carouselWidth) + carouselDragOffset;
  const shouldDisableCarouselTransition =
    isCarouselDragging || isCarouselTransitionDisabled;
  const virtualMediaItems = useMemo(
    () =>
      mediaItems
        .map((mediaItem, index) => ({
          index,
          mediaItem,
        }))
        .filter(({ index }) =>
          carouselWidth > 0
            ? Math.abs(index - visibleCarouselIndex) <= 1
            : index === visibleCarouselIndex
        ),
    [carouselWidth, mediaItems, visibleCarouselIndex]
  );
  const carouselTrackStyle = {
    transform: `translate3d(${carouselTrackOffset}px, 0, 0)`,
    transition: shouldDisableCarouselTransition ? "none" : undefined,
    width: carouselContentWidth,
  } satisfies CSSProperties;

  const clearCarouselSettleTimer = useCallback(() => {
    if (carouselSettleTimerRef.current !== null) {
      window.clearTimeout(carouselSettleTimerRef.current);
      carouselSettleTimerRef.current = null;
    }
  }, []);

  const clearCarouselTransitionFrame = useCallback(() => {
    if (carouselTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(carouselTransitionFrameRef.current);
      carouselTransitionFrameRef.current = null;
    }
  }, []);

  const disableCarouselTransition = useCallback(() => {
    setIsCarouselTransitionDisabled(true);
  }, []);

  const enableCarouselTransitionNextFrame = useCallback(() => {
    clearCarouselTransitionFrame();

    carouselTransitionFrameRef.current = window.requestAnimationFrame(() => {
      setIsCarouselTransitionDisabled(false);
      setCarouselDragOffset(0);
      carouselTransitionFrameRef.current = null;
    });
  }, [clearCarouselTransitionFrame]);

  useEffect(() => {
    const carousel = carouselRef.current;

    if (!carousel) {
      return;
    }

    const updateCarouselWidth = () => {
      setCarouselWidth(carousel.clientWidth);
    };
    const resizeObserver = new ResizeObserver(updateCarouselWidth);
    const frameId = window.requestAnimationFrame(updateCarouselWidth);

    resizeObserver.observe(carousel);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearCarouselSettleTimer();
      clearCarouselTransitionFrame();
    };
  }, [clearCarouselSettleTimer, clearCarouselTransitionFrame]);

  useEffect(() => {
    if (carouselWidth > 0 && isCarouselTransitionDisabled) {
      enableCarouselTransitionNextFrame();
    }
  }, [
    carouselWidth,
    enableCarouselTransitionNextFrame,
    isCarouselTransitionDisabled,
  ]);

  useEffect(() => {
    if (!isActivePost) {
      return;
    }

    for (const { mediaItem } of virtualMediaItems) {
      if (!mediaItem.url) {
        continue;
      }

      const image = new Image();
      image.src = mediaItem.url;
      void image.decode().catch(() => {});
    }
  }, [isActivePost, virtualMediaItems]);

  if (mediaItems.length === 0) {
    return null;
  }

  function settleCarouselIndex(index: number, offset: number) {
    const nextIndex = clampIndex(index, mediaItems.length);

    if (nextIndex === visibleCarouselIndex) {
      setCarouselDragOffset(0);
      return;
    }

    clearCarouselSettleTimer();
    setCarouselDragOffset(offset);

    carouselSettleTimerRef.current = window.setTimeout(() => {
      disableCarouselTransition();
      setActiveCarouselIndex(nextIndex);
      setCarouselDragOffset(0);
      carouselSettleTimerRef.current = null;
      enableCarouselTransitionNextFrame();
    }, CAROUSEL_TRANSITION_MS);
  }

  function moveCarousel(step: number) {
    const nextIndex = visibleCarouselIndex + step;

    if (nextIndex < 0 || nextIndex >= mediaItems.length) {
      return;
    }

    if (carouselWidth <= 0) {
      setActiveCarouselIndex(nextIndex);
      return;
    }

    settleCarouselIndex(nextIndex, -step * carouselWidth);
  }

  function handleCarouselPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }

    if (mediaItems.length < 2 || carouselSettleTimerRef.current !== null) {
      return;
    }

    carouselDragRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setIsCarouselDragging(true);
  }

  function handleCarouselPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = carouselDragRef.current;

    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    const isDraggingBeforeFirstItem = visibleCarouselIndex === 0 && deltaX > 0;
    const isDraggingAfterLastItem =
      visibleCarouselIndex === mediaItems.length - 1 && deltaX < 0;

    setCarouselDragOffset(
      isDraggingBeforeFirstItem || isDraggingAfterLastItem
        ? deltaX * DRAG_EDGE_RESISTANCE
        : deltaX
    );
  }

  function finishCarouselDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }

    const drag = carouselDragRef.current;
    carouselDragRef.current = null;
    setIsCarouselDragging(false);

    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    const shouldChangeItem =
      Math.abs(deltaX) >
        Math.min(
          carouselWidth * DRAG_DISTANCE_RATIO,
          MAX_SWIPE_THRESHOLD
        ) &&
      Math.abs(deltaX) > Math.abs(deltaY) * DRAG_AXIS_LOCK_RATIO;

    if (shouldChangeItem) {
      const direction = deltaX < 0 ? 1 : -1;
      const nextIndex = visibleCarouselIndex + direction;

      if (nextIndex >= 0 && nextIndex < mediaItems.length) {
        settleCarouselIndex(nextIndex, -direction * carouselWidth);
      } else {
        setCarouselDragOffset(0);
      }
      return;
    }

    setCarouselDragOffset(0);
  }

  function cancelCarouselDrag() {
    if (carouselDragRef.current) {
      carouselDragRef.current = null;
      setIsCarouselDragging(false);
      setCarouselDragOffset(0);
    }
  }

  function handleCarouselTouch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length > 1) {
      cancelCarouselDrag();
    }
  }

  return (
    <>
      <div
        className={styles.carouselViewport}
        onPointerCancel={cancelCarouselDrag}
        onPointerDown={handleCarouselPointerDown}
        onPointerLeave={cancelCarouselDrag}
        onPointerMove={handleCarouselPointerMove}
        onPointerUp={finishCarouselDrag}
        onTouchMove={handleCarouselTouch}
        onTouchStart={handleCarouselTouch}
        ref={carouselRef}
      >
        <div className={styles.carouselTrack} style={carouselTrackStyle}>
          {virtualMediaItems.map(({ mediaItem, index }) => {
            const shouldPrioritizeImage =
              isActivePost && Math.abs(index - visibleCarouselIndex) <= 1;
            const slideStyle = {
              left:
                carouselWidth > 0
                  ? `${index * carouselWidth}px`
                  : "0",
              width: carouselWidth > 0 ? `${carouselWidth}px` : "100%",
            } satisfies CSSProperties;

            return (
              <div
                className={styles.carouselSlide}
                key={mediaItem.mediaId}
                style={slideStyle}
              >
                <img
                  alt=""
                  className={
                    isImageCover
                      ? `${styles.modalImage} ${styles.modalImageCover}`
                      : styles.modalImage
                  }
                  decoding="async"
                  draggable={false}
                  fetchPriority={shouldPrioritizeImage ? "high" : "auto"}
                  loading={shouldPrioritizeImage ? "eager" : "lazy"}
                  src={mediaItem.url}
                />
              </div>
            );
          })}
        </div>
      </div>
      {mediaItems.length > 1 ? (
        <>
          <button
            aria-label="Previous image"
            className={`${styles.carouselButton} ${styles.carouselPrevious}`}
            disabled={visibleCarouselIndex === 0}
            onClick={() => moveCarousel(-1)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            aria-label="Next image"
            className={`${styles.carouselButton} ${styles.carouselNext}`}
            disabled={visibleCarouselIndex === mediaItems.length - 1}
            onClick={() => moveCarousel(1)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
          <div className={styles.carouselDots} aria-hidden="true">
            {mediaItems.map((item, index) => (
              <span
                className={
                  index === visibleCarouselIndex
                    ? styles.carouselDotActive
                    : undefined
                }
                key={item.mediaId}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function PostContent({
  post,
  postError,
  resolvedPost,
}: {
  post: ProfilePostSummary;
  postError: string | null;
  resolvedPost: ProfilePostDetail | ProfilePostSummary;
}) {
  return (
    <div className={styles.modalContent}>
      <time className={styles.modalDate} dateTime={post.createdAt}>
        {formatPostDate(post.createdAt)}
      </time>
      {resolvedPost.caption ? (
        <p className={styles.modalCaption}>{resolvedPost.caption}</p>
      ) : null}
      {postError ? <p className={styles.modalError}>{postError}</p> : null}
    </div>
  );
}

function PostActions({
  isImageCover,
  isLiked,
  likeCount,
  onToggleImageFit,
  onLike,
  postId,
}: {
  isImageCover: boolean;
  isLiked: boolean;
  likeCount: number;
  onToggleImageFit: () => void;
  onLike: (postId: string) => void;
  postId: string;
}) {
  return (
    <div className={styles.modalActions}>
      <button
        className={isLiked ? styles.modalLikeActive : styles.modalLike}
        disabled={isLiked}
        onClick={() => onLike(postId)}
        type="button"
      >
        <svg
          aria-hidden="true"
          className={styles.likeIcon}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>
      <strong>{formatCount(likeCount)}</strong>
      <button
        aria-label={isImageCover ? "Contain image" : "Cover image"}
        aria-pressed={isImageCover}
        className={styles.modalFit}
        onClick={onToggleImageFit}
        type="button"
      >
        <svg
          aria-hidden="true"
          className={styles.fitIcon}
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      </button>
    </div>
  );
}

function PostOwnerMenu({
  isDeletingPost,
  isOpen,
  onDelete,
  onToggle,
  post,
}: {
  isDeletingPost: boolean;
  isOpen: boolean;
  onDelete: (post: ProfilePostDetail, deleteMode?: DeleteMode) => void;
  onToggle: (postId: string) => void;
  post: ProfilePostDetail;
}) {
  return (
    <div className={styles.postMenu}>
      <button
        aria-expanded={isOpen}
        aria-label="Post options"
        className={styles.postMenuButton}
        onClick={() => onToggle(post.postId)}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {isOpen ? (
        <div className={styles.postMenuPanel}>
          <button
            disabled={isDeletingPost}
            onClick={() => onDelete(post)}
            type="button"
          >
            {isDeletingPost ? "Deleting..." : "Delete"}
          </button>
          <button
            disabled={isDeletingPost}
            onClick={() => onDelete(post, "force")}
            type="button"
          >
            Force delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PostFeedItem({
  canManagePost,
  isImageCover,
  isDeletingPost,
  isActive,
  isLiked,
  isMenuOpen,
  likeCount,
  onDelete,
  onToggleImageFit,
  onLike,
  onToggleMenu,
  post,
  postError,
  resolvedPost,
  style,
}: PostFeedItemProps) {
  const ownerPost =
    canManagePost && "media" in resolvedPost ? resolvedPost : null;

  return (
    <section className={styles.feedItem} style={style}>
      <div className={styles.modalVisual}>
        <PostMediaCarousel
          isImageCover={isImageCover}
          isActivePost={isActive}
          post={post}
          resolvedPost={resolvedPost}
        />
      </div>
      <PostContent
        post={post}
        postError={postError}
        resolvedPost={resolvedPost}
      />
      <PostActions
        isImageCover={isImageCover}
        isLiked={isLiked}
        likeCount={likeCount}
        onToggleImageFit={onToggleImageFit}
        onLike={onLike}
        postId={post.postId}
      />
      {ownerPost ? (
        <PostOwnerMenu
          isDeletingPost={isDeletingPost}
          isOpen={isMenuOpen}
          onDelete={onDelete}
          onToggle={onToggleMenu}
          post={ownerPost}
        />
      ) : null}
    </section>
  );
}
