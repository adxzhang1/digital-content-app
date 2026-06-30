"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { profileQueryKey } from "@/features/profile/profile-api";
import { profilePostsQueryKey } from "@/features/profile/profile-post-api";
import {
  createPost,
  getPostUploadUrls,
  uploadFile,
  waitForPostStatus,
  type UploadMedia,
} from "@/features/create-post/create-post-api";
import styles from "./page.module.css";

type FilePreview = {
  file: File;
  url: string;
};

type Status =
  | {
      tone: "idle";
      message: string;
    }
  | {
      tone: "success" | "error";
      message: string;
    };

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const allowedVideoTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
type ImageContentType = (typeof allowedImageTypes)[number];
type VideoContentType = (typeof allowedVideoTypes)[number];
const maxVideoBytes = 50 * 1024 * 1024;

const getSelectedMediaMessage = (selectedFiles: File[]) => {
  const firstFile = selectedFiles[0];

  if (firstFile && isAllowedVideoType(firstFile.type)) {
    return "1 video selected.";
  }

  return `${selectedFiles.length} image${
    selectedFiles.length === 1 ? "" : "s"
  } selected.`;
};

function isAllowedImageType(type: string): type is ImageContentType {
  return allowedImageTypes.includes(type as ImageContentType);
}

function isAllowedVideoType(type: string): type is VideoContentType {
  return allowedVideoTypes.includes(type as VideoContentType);
}

function isAllowedMediaType(type: string): type is UploadMedia["contentType"] {
  return isAllowedImageType(type) || isAllowedVideoType(type);
}

function VideoFilePreview({ src }: { src: string }) {
  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      src={src}
    />
  );
}

function validateSelectedFiles(selectedFiles: File[]) {
  const hasVideo = selectedFiles.some((file) => isAllowedVideoType(file.type));
  const hasImage = selectedFiles.some((file) => isAllowedImageType(file.type));
  const invalidFile = selectedFiles.find((file) => !isAllowedMediaType(file.type));

  if (invalidFile) {
    return "Media must be JPEG, PNG, WebP, MP4, MOV, or WebM.";
  }

  if (hasVideo && (hasImage || selectedFiles.length !== 1)) {
    return "A video must be the only media item in a post.";
  }

  if (hasVideo && selectedFiles[0] && selectedFiles[0].size > maxVideoBytes) {
    return "Video must be 50 MB or smaller.";
  }

  if (!hasVideo && selectedFiles.length > 10) {
    return "Choose no more than 10 images.";
  }

  return null;
}

type CreatePostFormProps = {
  profileId: string;
  username: string;
};

export function CreatePostForm({
  profileId,
  username,
}: CreatePostFormProps) {
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const filePreviewsRef = useRef<FilePreview[]>([]);
  const draggedFileIndexRef = useRef<number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<Status>({
    tone: "idle",
    message: "Ready to publish.",
  });
  const { isPending: isSubmitting, mutateAsync: submitPost } = useMutation({
    mutationFn: async ({
      caption,
      files,
    }: {
      caption: string;
      files: File[];
    }) => {
      setStatus({
        tone: "idle",
        message: "Preparing media uploads...",
      });
      const uploadData = await getPostUploadUrls({
        files,
        profileId,
      });

      const loadedByFile = new Array(files.length).fill(0) as number[];
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      const updateProgress = (index: number, loaded: number) => {
        loadedByFile[index] = loaded;
        const totalLoaded = loadedByFile.reduce(
          (total, current) => total + current,
          0
        );
        setUploadProgress(Math.round((totalLoaded / totalBytes) * 100));
      };

      setStatus({
        tone: "idle",
        message: "Uploading media...",
      });

      await Promise.all(
        files.map((file, index) =>
          uploadFile(file, uploadData.media[index].uploadUrl, (loaded) =>
            updateProgress(index, loaded)
          )
        )
      );

      setStatus({
        tone: "idle",
        message: "Processing media...",
      });

      await createPost({
        caption,
        idToken: uploadData.idToken,
        media: uploadData.media,
        postId: uploadData.postId,
        profileId,
      });

      const completedPost = await waitForPostStatus(
        uploadData.postId,
        uploadData.idToken
      );

      if (completedPost.status === "FAILED") {
        throw new Error("Media processing failed.");
      }

      if (completedPost.status === "DELETED") {
        throw new Error("Post was deleted before processing finished.");
      }

      return completedPost;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: profileQueryKey(username),
      });
      void queryClient.invalidateQueries({
        queryKey: profilePostsQueryKey(username),
      });
    },
  });
  const canSubmit = files.length > 0 && files.length <= 10 && !isSubmitting;

  useEffect(() => {
    return () => {
      filePreviewsRef.current.forEach((preview) =>
        URL.revokeObjectURL(preview.url)
      );
    };
  }, []);

  function replaceFiles(nextFiles: File[]) {
    const nextPreviews = nextFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));

    filePreviewsRef.current.forEach((preview) =>
      URL.revokeObjectURL(preview.url)
    );
    filePreviewsRef.current = nextPreviews;
    setFilePreviews(nextPreviews);
    setFiles(nextFiles);
  }

  function handleFilesChange(selectedFiles: FileList | null) {
    const nextFiles = Array.from(selectedFiles ?? []);

    if (nextFiles.length === 0) {
      return;
    }

    const validationError = validateSelectedFiles(nextFiles);

    if (validationError) {
      setStatus({
        tone: "error",
        message: validationError,
      });
      return;
    }

    replaceFiles(nextFiles);
    setActiveDraggedFileIndex(null);

    setStatus({
      tone: "idle",
      message: getSelectedMediaMessage(nextFiles),
    });
  }

  function setActiveDraggedFileIndex(index: number | null) {
    draggedFileIndexRef.current = index;
    setDraggedFileIndex(index);
  }

  function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
    const nextItems = [...items];
    const [movedItem] = nextItems.splice(fromIndex, 1);

    if (movedItem === undefined) {
      return items;
    }

    nextItems.splice(toIndex, 0, movedItem);
    return nextItems;
  }

  function reorderSelectedFiles(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return;
    }

    setFiles((currentFiles) => moveItem(currentFiles, fromIndex, toIndex));
    setFilePreviews((currentPreviews) => {
      const nextPreviews = moveItem(currentPreviews, fromIndex, toIndex);
      filePreviewsRef.current = nextPreviews;
      return nextPreviews;
    });
  }

  function handleFilePointerDown(
    event: PointerEvent<HTMLElement>,
    index: number
  ) {
    if (isSubmitting) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveDraggedFileIndex(index);
  }

  function handleFilePointerMove(event: PointerEvent<HTMLElement>) {
    const fromIndex = draggedFileIndexRef.current;

    if (fromIndex === null) {
      return;
    }

    event.preventDefault();

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-file-index]");
    const targetIndex = Number(target?.dataset.fileIndex);

    if (!Number.isInteger(targetIndex) || targetIndex === fromIndex) {
      return;
    }

    reorderSelectedFiles(fromIndex, targetIndex);
    setActiveDraggedFileIndex(targetIndex);
  }

  function handleFilePointerEnd() {
    setActiveDraggedFileIndex(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedCaption = caption.trim();

    if (files.length === 0) {
      setStatus({ tone: "error", message: "Choose at least one media item." });
      return;
    }

    const validationError = validateSelectedFiles(files);

    if (validationError) {
      setStatus({
        tone: "error",
        message: validationError,
      });
      return;
    }

    setUploadProgress(0);

    try {
      await submitPost({
        caption: trimmedCaption,
        files,
      });

      setCaption("");
      replaceFiles([]);
      setActiveDraggedFileIndex(null);
      setFileInputKey((currentKey) => currentKey + 1);
      setUploadProgress(0);
      setStatus({
        tone: "success",
        message: "Post is ready.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Could not create post.",
      });
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        <input
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          aria-label="Attach media"
          key={fileInputKey}
          multiple
          onChange={(event) => handleFilesChange(event.target.files)}
          type="file"
        />
      </label>

      {filePreviews.length > 0 ? (
        <div className={styles.selectedFiles}>
          {filePreviews.map((preview, index) => (
            <div
              aria-label={`Move ${preview.file.name}`}
              className={
                [
                  styles.selectedFile,
                  isAllowedVideoType(preview.file.type)
                    ? styles.selectedVideoFile
                    : "",
                  draggedFileIndex === index ? styles.draggingFile : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              data-file-index={index}
              key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
              onPointerCancel={handleFilePointerEnd}
              onPointerDown={(event) => handleFilePointerDown(event, index)}
              onPointerMove={handleFilePointerMove}
              onPointerUp={handleFilePointerEnd}
              role="button"
              tabIndex={0}
            >
              {isAllowedVideoType(preview.file.type) ? (
                <VideoFilePreview src={preview.url} />
              ) : (
                <img alt="" src={preview.url} />
              )}
            </div>
          ))}
        </div>
      ) : null}

      <label>
        <textarea
          aria-label="Caption"
          maxLength={2200}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Caption"
          rows={5}
          value={caption}
        />
      </label>

      {isSubmitting ? (
        <div className={styles.progress} aria-label="Upload progress">
          <span style={{ width: `${uploadProgress}%` }} />
        </div>
      ) : null}

      <div className={styles.formFooter}>
        <p className={styles[status.tone]}>{status.message}</p>
        <button disabled={!canSubmit} type="submit">
          {isSubmitting ? "Publishing..." : "Publish"}
        </button>
      </div>
    </form>
  );
}
