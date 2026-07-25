"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollSnapFeed } from "@/features/feed/scroll-snap-feed";
import { isAuthSessionReady, useAuth } from "@/app/auth-provider";
import {
  deletePost,
  fetchPostDetail,
  likePost,
  postDetailQueryKey,
  postDetailQueryRoot,
} from "@/features/profile/profile-post-api";
import { PostFeedItem, type DeleteMode } from "./post-feed-item";
import {
  PostMediaVideoManager,
  type ActiveVideo,
} from "./post-media-video-manager";
import styles from "./post-feed.module.css";
import type {
  ProfilePostDetail,
  ProfilePostSummary,
} from "@/features/profile/profile-data";

type PostFeedViewerProps = {
  initialPostId: string;
  onActivePostChange: (post: PostFeedPost) => void;
  onClose: () => void;
  onPostDeleted: (postId: string) => void;
  posts: PostFeedPost[];
};

export type PostFeedPost = ProfilePostSummary & {
  username: string;
};

type FeedPost = PostFeedPost & {
  id: string;
};

export function PostFeedViewer({
  initialPostId,
  onActivePostChange,
  onClose,
  onPostDeleted,
  posts,
}: PostFeedViewerProps) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAccountReady = isAuthSessionReady(auth.session);
  const currentProfileId = isAccountReady ? auth.account?.profileId : undefined;
  const [activePostId, setActivePostId] = useState(initialPostId);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isImageCover, setIsImageCover] = useState(false);
  const feedPosts = useMemo(
    () => posts.map((post) => ({ ...post, id: post.postId })),
    [posts]
  );
  const activePost = useMemo(
    () => posts.find((post) => post.postId === activePostId),
    [activePostId, posts]
  );
  const activePostDetailQuery = useQuery({
    enabled: Boolean(activePost && isAccountReady),
    queryKey: activePost
      ? postDetailQueryKey(activePost.username, activePost.postId)
      : postDetailQueryRoot,
    queryFn: () => {
      if (!activePost) {
        throw new Error("Could not load post.");
      }

      return fetchPostDetail(activePost.username, activePost.postId);
    },
  });
  const activePostDetail = activePostDetailQuery.data ?? null;
  const activeVideo = useMemo<ActiveVideo | null>(() => {
    if (!activePostDetail) {
      return null;
    }

    if (activePostDetail.media.length !== 1) {
      return null;
    }

    const activeMediaItem = activePostDetail.media[0];
    const hlsUrl = activeMediaItem?.sources?.hls?.url;

    if (
      !activeMediaItem ||
      activeMediaItem.type !== "VIDEO" ||
      !hlsUrl
    ) {
      return null;
    }

    return {
      hlsUrl,
      mediaItemId: activeMediaItem.mediaId,
      postId: activePostDetail.postId,
    };
  }, [activePostDetail]);
  const postError =
    deleteError ??
    (activePostDetailQuery.error instanceof Error
      ? activePostDetailQuery.error.message
      : null);
  const { mutate: mutateLikePost } = useMutation({
    mutationFn: ({
      postId,
      username,
    }: {
      postId: string;
      username: string;
    }) => likePost(username, postId),
    onError: (_error, { postId }) => {
      setLikedPostIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(postId);
        return nextIds;
      });
    },
  });
  const { isPending: isDeletingPost, mutate: mutateDeletePost } = useMutation({
    mutationFn: ({
      deleteMode,
      post,
      username,
    }: {
      deleteMode?: DeleteMode;
      post: ProfilePostDetail;
      username: string;
    }) => deletePost({ deleteMode, post, username }),
    onSuccess: (_data, { post, username }) => {
      setLikedPostIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(post.postId);
        return nextIds;
      });
      queryClient.removeQueries({
        queryKey: postDetailQueryKey(username, post.postId),
      });

      onPostDeleted(post.postId);
    },
    onError: (error) => {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete post."
      );
    },
  });
  const handleToggleImageFit = useCallback(() => {
    setIsImageCover((currentValue) => !currentValue);
  }, []);
  const handleActivePostChange = useCallback(
    (post: FeedPost) => {
      setActivePostId(post.postId);
      setDeleteError(null);
      onActivePostChange(post);
    },
    [onActivePostChange]
  );
  const handleLikePost = useCallback(
    (post: PostFeedPost) => {
      if (likedPostIds.has(post.postId)) {
        return;
      }

      setLikedPostIds((currentIds) => new Set(currentIds).add(post.postId));

      if (!isAccountReady) {
        return;
      }

      mutateLikePost({
        postId: post.postId,
        username: post.username,
      });
    },
    [isAccountReady, likedPostIds, mutateLikePost]
  );
  const handleDeletePost = useCallback(
    (
      feedPost: PostFeedPost,
      detailPost: ProfilePostDetail,
      deleteMode: DeleteMode = "soft"
    ) => {
      if (!isAccountReady || auth.account?.profileId !== detailPost.profileId) {
        return;
      }

      setDeleteError(null);
      mutateDeletePost({
        deleteMode,
        post: detailPost,
        username: feedPost.username,
      });
    },
    [auth.account?.profileId, isAccountReady, mutateDeletePost]
  );
  const getCachedPostDetail = useCallback(
    (post: PostFeedPost) =>
      queryClient.getQueryData<ProfilePostDetail>(
        postDetailQueryKey(post.username, post.postId)
      ),
    [queryClient]
  );

  const renderFeedPost = useCallback(
    (post: FeedPost, { isActive }: { isActive: boolean }) => {
      const cachedPostDetail = getCachedPostDetail(post);
      const detailPost =
        post.postId === activePostId
          ? activePostDetail ?? cachedPostDetail
          : cachedPostDetail;
      const resolvedPost = detailPost ?? post;
      const canManagePost =
        detailPost && currentProfileId === detailPost.profileId;
      const isLiked = likedPostIds.has(post.postId);
      const likeCount = resolvedPost.likeCount + (isLiked ? 1 : 0);

      return (
        <PostFeedItem
          canManagePost={Boolean(canManagePost)}
          isImageCover={isImageCover}
          isDeletingPost={isDeletingPost}
          isActive={isActive}
          isLiked={isLiked}
          likeCount={likeCount}
          onDelete={(detailPost, deleteMode) =>
            handleDeletePost(post, detailPost, deleteMode)
          }
          onToggleImageFit={handleToggleImageFit}
          onLike={() => handleLikePost(post)}
          post={post}
          postError={
            postError && post.postId === activePostId ? postError : null
          }
          resolvedPost={resolvedPost}
        />
      );
    },
    [
      activePostId,
      activePostDetail,
      currentProfileId,
      getCachedPostDetail,
      handleDeletePost,
      handleLikePost,
      handleToggleImageFit,
      isDeletingPost,
      isImageCover,
      likedPostIds,
      postError,
    ]
  );

  return (
    <main aria-label="Feed" className={styles.viewer}>
      <div className={styles.feedShell}>
        <PostMediaVideoManager
          activeVideo={activeVideo}
          isImageCover={isImageCover}
        >
          <ScrollSnapFeed
            activeItemId={activePostId}
            ariaLabel="Post feed"
            items={feedPosts}
            onActiveItemChange={handleActivePostChange}
            renderItem={renderFeedPost}
          />
        </PostMediaVideoManager>
        <button
          aria-label="Close post"
          className={styles.closeButton}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
    </main>
  );
}
