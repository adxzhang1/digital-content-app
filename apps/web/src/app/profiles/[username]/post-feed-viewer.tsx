"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollSnapFeed } from "@/features/feed/scroll-snap-feed";
import { isAuthSessionReady, useAuth } from "../../auth-provider";
import {
  deletePost,
  fetchPostDetail,
  likePost,
  postDetailQueryKey,
} from "@/features/profile/profile-post-api";
import { PostFeedItem, type DeleteMode } from "./post-feed-item";
import styles from "./post-feed-viewer.module.css";
import type {
  ProfilePostDetail,
  ProfilePostSummary,
} from "@/features/profile/profile-data";

type PostFeedViewerProps = {
  initialPostId: string;
  onClose: () => void;
  onPostDeleted: (postId: string) => void;
  posts: ProfilePostSummary[];
  username: string;
};

type FeedPost = ProfilePostSummary & {
  id: string;
};

export function PostFeedViewer({
  initialPostId,
  onClose,
  onPostDeleted,
  posts,
  username,
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
      ? postDetailQueryKey(username, activePost.postId)
      : ["post-detail", username],
    queryFn: () => {
      if (!activePost) {
        throw new Error("Could not load post.");
      }

      return fetchPostDetail(username, activePost.postId);
    },
  });
  const activePostDetail = activePostDetailQuery.data ?? null;
  const postError =
    deleteError ??
    (activePostDetailQuery.error instanceof Error
      ? activePostDetailQuery.error.message
      : null);
  const { mutate: mutateLikePost } = useMutation({
    mutationFn: (postId: string) => likePost(username, postId),
    onError: (_error, postId) => {
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
    }: {
      deleteMode?: DeleteMode;
      post: ProfilePostDetail;
    }) => deletePost({ deleteMode, post, username }),
    onSuccess: (_data, { post }) => {
      setLikedPostIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(post.postId);
        return nextIds;
      });
      queryClient.removeQueries({
        queryKey: postDetailQueryKey(username, post.postId),
      });
      onPostDeleted(post.postId);
      onClose();
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
    },
    []
  );
  const handleLikePost = useCallback(
    async (postId: string) => {
      if (likedPostIds.has(postId)) {
        return;
      }

      setLikedPostIds((currentIds) => new Set(currentIds).add(postId));

      if (!isAccountReady) {
        return;
      }

      mutateLikePost(postId);
    },
    [isAccountReady, likedPostIds, mutateLikePost]
  );
  const handleDeletePost = useCallback(
    (post: ProfilePostDetail, deleteMode: DeleteMode = "soft") => {
      if (!isAccountReady || auth.account?.profileId !== post.profileId) {
        return;
      }

      setDeleteError(null);
      mutateDeletePost({ deleteMode, post });
    },
    [auth.account?.profileId, isAccountReady, mutateDeletePost]
  );
  const getCachedPostDetail = useCallback(
    (postId: string) =>
      queryClient.getQueryData<ProfilePostDetail>(
        postDetailQueryKey(username, postId)
      ),
    [queryClient, username]
  );

  const renderFeedPost = useCallback(
    (post: FeedPost, { isActive }: { isActive: boolean }) => {
      const cachedPostDetail = getCachedPostDetail(post.postId);
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
          onDelete={(post, deleteMode) => void handleDeletePost(post, deleteMode)}
          onToggleImageFit={handleToggleImageFit}
          onLike={(postId) => void handleLikePost(postId)}
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
    <div
      aria-label="Feed"
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <article className={styles.modal}>
        <div className={styles.feedShell}>
          <ScrollSnapFeed
            activeItemId={activePostId}
            ariaLabel="Post feed"
            items={feedPosts}
            onActiveItemChange={handleActivePostChange}
            renderItem={renderFeedPost}
          />
          <button
            aria-label="Close post"
            className={styles.modalClose}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </article>
    </div>
  );
}
