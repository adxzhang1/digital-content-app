"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, TouchEvent } from "react";
import { PostFeedItem, type DeleteMode } from "./post-feed-item";
import styles from "./post-feed-viewer.module.css";
import type { ProfilePostDetail, ProfilePostSummary } from "./profile-data";

type PostFeedViewerProps = {
  activePostId: string | null;
  currentProfileId?: string;
  isDeletingPost: boolean;
  isLoadingPost: boolean;
  isPostMenuOpen: boolean;
  likedPostIds: Set<string>;
  likeCounts: Record<string, number>;
  onActivePostChange: (post: ProfilePostSummary) => void;
  onClose: () => void;
  onDelete: (post: ProfilePostDetail, deleteMode?: DeleteMode) => void;
  onLike: (postId: string) => void;
  onTogglePostMenu: (postId: string) => void;
  postDetails: Record<string, ProfilePostDetail>;
  postError: string | null;
  posts: ProfilePostSummary[];
};

type DragPoint = {
  x: number;
  y: number;
};

const DRAG_AXIS_LOCK_RATIO = 1.2;
const FEED_TRANSITION_MS = 200;
const DRAG_DISTANCE_RATIO = 0.14;
const DRAG_EDGE_RESISTANCE = 0.18;
const MAX_SWIPE_THRESHOLD = 96;

const clampIndex = (index: number, length: number) =>
  length <= 0 ? 0 : Math.min(length - 1, Math.max(0, index));

export function PostFeedViewer({
  activePostId,
  currentProfileId,
  isDeletingPost,
  isLoadingPost,
  isPostMenuOpen,
  likedPostIds,
  likeCounts,
  onActivePostChange,
  onClose,
  onDelete,
  onLike,
  onTogglePostMenu,
  postDetails,
  postError,
  posts,
}: PostFeedViewerProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedSettleTimerRef = useRef<number | null>(null);
  const feedTransitionFrameRef = useRef<number | null>(null);
  const feedDragRef = useRef<DragPoint | null>(null);
  const initialPostIndex = Math.max(
    0,
    posts.findIndex((post) => post.postId === activePostId)
  );
  const [activeFeedIndex, setActiveFeedIndex] = useState(initialPostIndex);
  const [feedDragOffset, setFeedDragOffset] = useState(0);
  const [feedHeight, setFeedHeight] = useState(0);
  const [isFeedDragging, setIsFeedDragging] = useState(false);
  const [isFeedTransitionDisabled, setIsFeedTransitionDisabled] =
    useState(true);
  const [isImageCover, setIsImageCover] = useState(false);
  const visibleFeedIndex = clampIndex(activeFeedIndex, posts.length);
  const feedContentHeight =
    feedHeight > 0
      ? `${posts.length * feedHeight}px`
      : "100dvh";
  const feedTrackOffset = -(visibleFeedIndex * feedHeight) + feedDragOffset;
  const shouldDisableFeedTransition =
    isFeedDragging || isFeedTransitionDisabled;
  const virtualPosts = posts
    .map((post, index) => ({
      index,
      post,
    }))
    .filter(({ index }) =>
      feedHeight > 0
        ? Math.abs(index - visibleFeedIndex) <= 1
        : index === visibleFeedIndex
    );
  const feedTrackStyle = {
    height: feedContentHeight,
    transform: `translate3d(0, ${feedTrackOffset}px, 0)`,
    transition: shouldDisableFeedTransition ? "none" : undefined,
  } satisfies CSSProperties;

  const clearFeedSettleTimer = useCallback(() => {
    if (feedSettleTimerRef.current !== null) {
      window.clearTimeout(feedSettleTimerRef.current);
      feedSettleTimerRef.current = null;
    }
  }, []);

  const clearFeedTransitionFrame = useCallback(() => {
    if (feedTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(feedTransitionFrameRef.current);
      feedTransitionFrameRef.current = null;
    }
  }, []);

  const disableFeedTransition = useCallback(() => {
    setIsFeedTransitionDisabled(true);
  }, []);

  const enableFeedTransitionNextFrame = useCallback(() => {
    clearFeedTransitionFrame();

    feedTransitionFrameRef.current = window.requestAnimationFrame(() => {
      setIsFeedTransitionDisabled(false);
      setFeedDragOffset(0);
      feedTransitionFrameRef.current = null;
    });
  }, [clearFeedTransitionFrame]);

  useEffect(() => {
    const feed = feedRef.current;

    if (!feed) {
      return;
    }

    const updateFeedHeight = () => {
      setFeedHeight(feed.clientHeight);
    };
    const resizeObserver = new ResizeObserver(updateFeedHeight);
    const frameId = window.requestAnimationFrame(updateFeedHeight);

    resizeObserver.observe(feed);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearFeedSettleTimer();
      clearFeedTransitionFrame();
    };
  }, [clearFeedSettleTimer, clearFeedTransitionFrame]);

  useEffect(() => {
    if (feedHeight > 0 && isFeedTransitionDisabled) {
      enableFeedTransitionNextFrame();
    }
  }, [enableFeedTransitionNextFrame, feedHeight, isFeedTransitionDisabled]);

  function settleFeedIndex(index: number, offset: number) {
    const nextIndex = clampIndex(index, posts.length);
    const nextPost = posts[nextIndex];

    if (!nextPost || nextIndex === visibleFeedIndex) {
      setFeedDragOffset(0);
      return;
    }

    clearFeedSettleTimer();

    setFeedDragOffset(offset);

    feedSettleTimerRef.current = window.setTimeout(() => {
      disableFeedTransition();
      setActiveFeedIndex(nextIndex);
      setFeedDragOffset(0);
      feedSettleTimerRef.current = null;
      enableFeedTransitionNextFrame();

      if (nextPost.postId !== activePostId) {
        onActivePostChange(nextPost);
      }
    }, FEED_TRANSITION_MS);
  }

  function handleFeedPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }

    if (posts.length < 2 || feedSettleTimerRef.current !== null) {
      return;
    }

    feedDragRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setIsFeedDragging(true);
  }

  function handleFeedPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = feedDragRef.current;

    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return;
    }

    const isDraggingBeforeFirstPost = visibleFeedIndex === 0 && deltaY > 0;
    const isDraggingAfterLastPost =
      visibleFeedIndex === posts.length - 1 && deltaY < 0;

    setFeedDragOffset(
      isDraggingBeforeFirstPost || isDraggingAfterLastPost
        ? deltaY * DRAG_EDGE_RESISTANCE
        : deltaY
    );
  }

  function finishFeedDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) {
      return;
    }

    const drag = feedDragRef.current;
    feedDragRef.current = null;
    setIsFeedDragging(false);

    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    const shouldChangePost =
      Math.abs(deltaY) >
        Math.min(
          feedHeight * DRAG_DISTANCE_RATIO,
          MAX_SWIPE_THRESHOLD
        ) &&
      Math.abs(deltaY) > Math.abs(deltaX) * DRAG_AXIS_LOCK_RATIO;

    if (shouldChangePost) {
      const direction = deltaY < 0 ? 1 : -1;
      const nextIndex = visibleFeedIndex + direction;

      if (nextIndex >= 0 && nextIndex < posts.length) {
        settleFeedIndex(nextIndex, -direction * feedHeight);
      } else {
        setFeedDragOffset(0);
      }
      return;
    }

    setFeedDragOffset(0);
  }

  function cancelFeedDrag() {
    if (feedDragRef.current) {
      feedDragRef.current = null;
      setIsFeedDragging(false);
      setFeedDragOffset(0);
    }
  }

  function handleFeedTouch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length > 1) {
      cancelFeedDrag();
    }
  }

  return (
    <div
      aria-label="Post feed"
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <article className={styles.modal}>
        {activePostId ? (
          <div
            className={styles.feedViewer}
            onPointerCancel={cancelFeedDrag}
            onPointerDown={handleFeedPointerDown}
            onPointerLeave={cancelFeedDrag}
            onPointerMove={handleFeedPointerMove}
            onPointerUp={finishFeedDrag}
            onTouchMove={handleFeedTouch}
            onTouchStart={handleFeedTouch}
            ref={feedRef}
          >
            <div className={styles.feedTrack} style={feedTrackStyle}>
              {virtualPosts.map(({ index, post }) => {
                const detailPost = postDetails[post.postId];
                const resolvedPost = detailPost ?? post;
                const canManagePost =
                  detailPost && currentProfileId === detailPost.profileId;
                const feedItemStyle = {
                  top:
                    feedHeight > 0
                      ? `${index * feedHeight}px`
                      : "0",
                } satisfies CSSProperties;

                return (
                  <PostFeedItem
                    canManagePost={Boolean(canManagePost)}
                    isImageCover={isImageCover}
                    isDeletingPost={isDeletingPost}
                    isActive={index === visibleFeedIndex}
                    isLiked={likedPostIds.has(post.postId)}
                    isMenuOpen={isPostMenuOpen && post.postId === activePostId}
                    key={post.postId}
                    likeCount={likeCounts[post.postId] ?? 0}
                    onDelete={onDelete}
                    onToggleImageFit={() =>
                      setIsImageCover((currentValue) => !currentValue)
                    }
                    onLike={onLike}
                    onToggleMenu={onTogglePostMenu}
                    post={post}
                    postError={
                      postError && post.postId === activePostId
                        ? postError
                        : null
                    }
                    resolvedPost={resolvedPost}
                    style={feedItemStyle}
                  />
                );
              })}
            </div>
            <button
              aria-label="Close post"
              className={styles.modalClose}
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        ) : (
          <div className={styles.modalVisual} />
        )}
        {!activePostId ? (
          <div className={styles.modalLoading}>
            <button aria-label="Close post" onClick={onClose} type="button">
              ×
            </button>
            <p>{postError ?? (isLoadingPost ? "Fetching post details..." : "")}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}
