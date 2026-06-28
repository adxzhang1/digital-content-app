"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  completeProfilePictureUpload,
  createProfilePictureUpload,
  uploadProfilePictureFile,
  waitForProfilePicture,
  type Profile,
} from "@/features/profile/profile-api";
import styles from "../page.module.css";

type EditProfilePictureProps = {
  onClose: () => void;
  onUpdated: (profile: Profile) => void;
  username: string;
};

export function EditProfilePicture({
  onClose,
  onUpdated,
  username,
}: EditProfilePictureProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [imageProgress, setImageProgress] = useState(0);
  const [error, setError] = useState("");
  const imagePreviewUrlRef = useRef("");
  const updateImageMutation = useMutation({
    mutationFn: async () => {
      if (!imageFile) {
        throw new Error("Choose a profile picture.");
      }

      setImageProgress(0);
      const uploadData = await createProfilePictureUpload(imageFile);

      await uploadProfilePictureFile(
        imageFile,
        uploadData.uploadUrl,
        setImageProgress
      );
      const profilePicture = await completeProfilePictureUpload({
        imageId: uploadData.imageId,
      });

      return waitForProfilePicture({
        imageId: profilePicture.imageId,
        username,
      });
    },
    onSuccess: (updatedProfile) => {
      setError("");
      onUpdated(updatedProfile);
    },
    onError: (error) => {
      setError(
        error instanceof Error ? error.message : "Could not update profile picture."
      );
    },
  });

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
    };
  }, []);

  function handleImageChange(file: File | undefined) {
    if (!file) {
      return;
    }

    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);

    imagePreviewUrlRef.current = previewUrl;
    setImageFile(file);
    setImagePreviewUrl(previewUrl);
    setImageProgress(0);
    setError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    updateImageMutation.mutate();
  }

  return (
    <div
      aria-label="Edit profile picture"
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <section className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h2>Edit profile picture</h2>
          <button
            aria-label="Close edit profile picture"
            className={styles.modalClose}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            <input
              accept="image/jpeg,image/png,image/webp"
              aria-label="Profile picture"
              onChange={(event) => handleImageChange(event.target.files?.[0])}
              type="file"
            />
          </label>

          {imagePreviewUrl ? (
            <div className={styles.profilePicturePreview}>
              <img alt="" src={imagePreviewUrl} />
            </div>
          ) : null}

          {updateImageMutation.isPending ? (
            <div
              className={styles.progress}
              aria-label="Profile picture upload progress"
            >
              <span style={{ width: `${imageProgress}%` }} />
            </div>
          ) : null}

          <div className={styles.formFooter}>
            <p className={error ? styles.error : styles.idle}>{error}</p>
            <button
              disabled={!imageFile || updateImageMutation.isPending}
              type="submit"
            >
              {updateImageMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
