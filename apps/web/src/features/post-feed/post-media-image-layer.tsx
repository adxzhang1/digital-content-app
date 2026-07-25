import { memo, useCallback, useEffect } from "react";
import { ScrollSnapCarousel } from "@/features/feed/scroll-snap-carousel";
import styles from "./post-feed.module.css";

type PostMediaImageItem = {
  id: string;
  type: string;
  url?: string;
};

function PostMediaImage({
  isHidden = false,
  isImageCover,
  preload,
  url,
}: {
  isHidden?: boolean;
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

  const mediaClassName = isImageCover
    ? `${styles.mediaElement} ${styles.mediaElementCover}`
    : styles.mediaElement;

  return (
    <img
      alt=""
      className={`${mediaClassName} ${
        isHidden ? styles.mediaImageHidden : ""
      }`}
      decoding="async"
      draggable={false}
      fetchPriority={preload ? "high" : "auto"}
      loading={preload ? "eager" : "lazy"}
      src={url}
    />
  );
}

const PostMediaImageCarousel = memo(function PostMediaImageCarousel({
  isImageCover,
  mediaItems,
  preload,
}: {
  isImageCover: boolean;
  mediaItems: PostMediaImageItem[];
  preload: boolean;
}) {
  const renderCarouselItem = useCallback(
    (item: PostMediaImageItem, { isPriority }: { isPriority: boolean }) => (
      <PostMediaImage
        isImageCover={isImageCover}
        preload={preload && isPriority}
        url={item.url}
      />
    ),
    [isImageCover, preload],
  );

  return (
    <ScrollSnapCarousel items={mediaItems} renderItem={renderCarouselItem} />
  );
});

export const PostMediaImageLayer = memo(function PostMediaImageLayer({
  hiddenMediaItemId,
  isImageCover,
  mediaItems,
  preload,
}: {
  hiddenMediaItemId?: string;
  isImageCover: boolean;
  mediaItems: PostMediaImageItem[];
  preload: boolean;
}) {
  if (mediaItems.length === 1) {
    return (
      <PostMediaImage
        isHidden={mediaItems[0].id === hiddenMediaItemId}
        isImageCover={isImageCover}
        preload={preload}
        url={mediaItems[0].url}
      />
    );
  }

  return (
    <PostMediaImageCarousel
      isImageCover={isImageCover}
      mediaItems={mediaItems}
      preload={preload}
    />
  );
});
