import { useState } from "react";
import { PostMedia } from "./post-media";
import styles from "./post-feed-viewer.module.css";
import type {
  ProfilePostDetail,
  ProfilePostSummary,
} from "@/features/profile/profile-data";

export type DeleteMode = "soft" | "force";

export type PostFeedItemProps = {
  canManagePost: boolean;
  isImageCover: boolean;
  isDeletingPost: boolean;
  isActive: boolean;
  isLiked: boolean;
  likeCount: number;
  onDelete: (post: ProfilePostDetail, deleteMode?: DeleteMode) => void;
  onToggleImageFit: () => void;
  onLike: (postId: string) => void;
  post: ProfilePostSummary;
  postError: string | null;
  resolvedPost: ProfilePostDetail | ProfilePostSummary;
};

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
  onDelete,
  post,
}: {
  isDeletingPost: boolean;
  onDelete: (post: ProfilePostDetail, deleteMode?: DeleteMode) => void;
  post: ProfilePostDetail;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.postMenu}>
      <button
        aria-expanded={isOpen}
        aria-label="Post options"
        className={styles.postMenuButton}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
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
  likeCount,
  onDelete,
  onToggleImageFit,
  onLike,
  post,
  postError,
  resolvedPost,
}: PostFeedItemProps) {
  const ownerPost =
    canManagePost && "media" in resolvedPost ? resolvedPost : null;

  return (
    <section className={styles.feedItem}>
      <div className={styles.modalVisual}>
        <PostMedia
          isActive={isActive}
          isImageCover={isImageCover}
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
          onDelete={onDelete}
          post={ownerPost}
        />
      ) : null}
    </section>
  );
}
