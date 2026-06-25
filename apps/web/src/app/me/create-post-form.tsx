"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { getCurrentIdToken } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";
import styles from "./page.module.css";

type PostProcessingStatus = "PROCESSING" | "READY" | "FAILED" | "DELETED";

type UploadMedia = {
  mediaId: string;
  position: number;
  type: "IMAGE";
  contentType: "image/jpeg" | "image/png" | "image/webp";
  originalKey: string;
  uploadUrl: string;
};

type PostStatus = {
  postId: string;
  profileId: string;
  status: PostProcessingStatus;
  media: unknown[];
  createdAt: string;
  updatedAt: string;
};

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

const apiBaseUrl = publicConfig.apiBaseUrl;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

const getSelectedImagesMessage = (count: number) =>
  `${count} image${count === 1 ? "" : "s"} selected.`;

function isAllowedImageType(type: string): type is UploadMedia["contentType"] {
  return allowedImageTypes.includes(type as UploadMedia["contentType"]);
}

function uploadFile(file: File, uploadUrl: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }

      reject(new Error("Image upload failed."));
    });
    request.addEventListener("error", () => reject(new Error("Image upload failed.")));
    request.open("PUT", uploadUrl);
    request.setRequestHeader("content-type", file.type);
    request.send(file);
  });
}

async function waitForPostStatus(
  postId: string,
  idToken: string
): Promise<PostStatus> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${apiBaseUrl}/posts/${postId}`, {
      headers: {
        authorization: `Bearer ${idToken}`,
      },
    });
    const data = (await response.json()) as {
      post?: PostStatus;
      message?: string;
    };

    if (!response.ok || !data.post) {
      throw new Error(data.message ?? "Could not load post status.");
    }

    if (
      data.post.status === "READY" ||
      data.post.status === "FAILED" ||
      data.post.status === "DELETED"
    ) {
      return data.post;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Post is still processing. Check back shortly.");
}

type CreatePostFormProps = {
  profileId: string;
};

export function CreatePostForm({ profileId }: CreatePostFormProps) {
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [draggedFileIndex, setDraggedFileIndex] = useState<number | null>(null);
  const filePreviewsRef = useRef<FilePreview[]>([]);
  const draggedFileIndexRef = useRef<number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<Status>({
    tone: "idle",
    message: "Ready to publish.",
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

    const invalidFile = nextFiles.find((file) => !isAllowedImageType(file.type));

    replaceFiles(nextFiles);
    setActiveDraggedFileIndex(null);

    if (nextFiles.length > 10) {
      setStatus({
        tone: "error",
        message: "Choose no more than 10 images.",
      });
      return;
    }

    if (invalidFile) {
      setStatus({
        tone: "error",
        message: "Images must be JPEG, PNG, or WebP.",
      });
      return;
    }

    setStatus({
      tone: "idle",
      message: getSelectedImagesMessage(nextFiles.length),
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
    event: PointerEvent<HTMLButtonElement>,
    index: number
  ) {
    if (isSubmitting) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveDraggedFileIndex(index);
  }

  function handleFilePointerMove(event: PointerEvent<HTMLButtonElement>) {
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
      setStatus({
        tone: "error",
        message: "Choose at least one image.",
      });
      return;
    }

    if (files.length > 10 || files.some((file) => !isAllowedImageType(file.type))) {
      setStatus({
        tone: "error",
        message: "Choose 1-10 JPEG, PNG, or WebP images.",
      });
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const idToken = await getCurrentIdToken();
      setStatus({
        tone: "idle",
        message: "Preparing image uploads...",
      });

      const uploadUrlResponse = await fetch(`${apiBaseUrl}/posts/upload-urls`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${idToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profileId,
          images: files.map((file) => ({
            contentType: file.type,
          })),
        }),
      });

      const uploadUrlData = (await uploadUrlResponse.json()) as {
        postId?: string;
        media?: UploadMedia[];
        message?: string;
      };

      if (!uploadUrlResponse.ok || !uploadUrlData.postId || !uploadUrlData.media) {
        throw new Error(uploadUrlData.message ?? "Could not prepare uploads.");
      }

      const loadedByFile = new Array(files.length).fill(0) as number[];
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      const updateProgress = (index: number, loaded: number) => {
        loadedByFile[index] = loaded;
        const totalLoaded = loadedByFile.reduce((total, current) => total + current, 0);
        setUploadProgress(Math.round((totalLoaded / totalBytes) * 100));
      };

      setStatus({
        tone: "idle",
        message: "Uploading images...",
      });

      await Promise.all(
        files.map((file, index) =>
          uploadFile(file, uploadUrlData.media![index].uploadUrl, (loaded) =>
            updateProgress(index, loaded)
          )
        )
      );

      setStatus({
        tone: "idle",
        message: "Processing images...",
      });

      const finalizeResponse = await fetch(`${apiBaseUrl}/posts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${idToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          postId: uploadUrlData.postId,
          profileId,
          caption: trimmedCaption,
          media: uploadUrlData.media.map((media) => ({
            mediaId: media.mediaId,
            position: media.position,
            type: media.type,
            originalKey: media.originalKey,
            contentType: media.contentType,
          })),
        }),
      });

      const finalizeData = (await finalizeResponse.json()) as {
        post?: unknown;
        message?: string;
      };

      if (!finalizeResponse.ok || !finalizeData.post) {
        throw new Error(finalizeData.message ?? "Could not finalize post.");
      }

      const completedPost = await waitForPostStatus(uploadUrlData.postId, idToken);

      if (completedPost.status === "FAILED") {
        throw new Error("Image processing failed.");
      }

      if (completedPost.status === "DELETED") {
        throw new Error("Post was deleted before processing finished.");
      }

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
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>
        <input
          accept="image/jpeg,image/png,image/webp"
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
            <button
              aria-label={`Move ${preview.file.name}`}
              className={
                draggedFileIndex === index
                  ? `${styles.selectedFile} ${styles.draggingFile}`
                  : styles.selectedFile
              }
              data-file-index={index}
              key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
              onPointerCancel={handleFilePointerEnd}
              onPointerDown={(event) => handleFilePointerDown(event, index)}
              onPointerMove={handleFilePointerMove}
              onPointerUp={handleFilePointerEnd}
              type="button"
            >
              <img alt="" src={preview.url} />
            </button>
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
