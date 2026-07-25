import { useMemo } from "react";
import { PostMediaImageLayer } from "./post-media-image-layer";
import { usePostMediaVideo, VideoHost } from "./post-media-video-manager";
import type {
  ProfilePostDetail,
  ProfilePostSummary,
} from "@/features/profile/profile-data";

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

export function PostMedia({
  isActive,
  isImageCover,
  post,
  resolvedPost,
}: PostMediaProps) {
  const { readyVideoItemId } = usePostMediaVideo();
  const mediaItems = useMemo(
    () =>
      getPostMediaItems(post, resolvedPost).map((item) => ({
        id: item.mediaId,
        type: item.type,
        url: item.url,
      })),
    [post, resolvedPost]
  );

  if (mediaItems.length === 0) {
    return null;
  }

  const mediaItem = mediaItems[0];
  const hiddenMediaItemId =
    isActive && readyVideoItemId === mediaItem.id && mediaItem.type === "VIDEO"
      ? mediaItem.id
      : undefined;

  return (
    <>
      <PostMediaImageLayer
        hiddenMediaItemId={hiddenMediaItemId}
        isImageCover={isImageCover}
        mediaItems={mediaItems}
        preload={isActive}
      />
      <VideoHost postId={post.postId} />
    </>
  );
}
