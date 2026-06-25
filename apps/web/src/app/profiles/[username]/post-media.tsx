import { useCallback, useEffect, useMemo } from "react";
import { ScrollSnapCarousel } from "@/features/feed/scroll-snap-carousel";
import styles from "./post-feed-viewer.module.css";
import type { ProfilePostDetail, ProfilePostSummary } from "./profile-data";

type FeedMediaItem = {
  id: string;
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

function MediaItem({
  isImageCover,
  preload,
  url,
}: {
  isImageCover: boolean;
  preload: boolean;
  url?: string;
}) {
  useEffect(() => {
    if (!preload || !url) {
      return;
    }

    const image = new Image();
    image.src = url;
    void image.decode().catch(() => {});
  }, [preload, url]);

  if (!url) {
    return null;
  }

  return (
    <img
      alt=""
      className={
        isImageCover
          ? `${styles.modalImage} ${styles.modalImageCover}`
          : styles.modalImage
      }
      decoding="async"
      draggable={false}
      fetchPriority={preload ? "high" : "auto"}
      loading={preload ? "eager" : "lazy"}
      src={url}
    />
  );
}

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
        isImageCover={isImageCover}
        preload={isActive && isPriority}
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
        isImageCover={isImageCover}
        preload={isActive}
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
