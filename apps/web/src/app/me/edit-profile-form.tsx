"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  updateCurrentProfile,
  type Profile,
} from "@/features/profile/profile-api";
import styles from "./page.module.css";

type EditProfileFormProps = {
  bio: string;
  displayName: string;
  onClose: () => void;
  onUpdated: (profile: Profile) => void;
};

export function EditProfileForm({
  bio,
  displayName,
  onClose,
  onUpdated,
}: EditProfileFormProps) {
  const [displayNameInput, setDisplayNameInput] = useState(displayName);
  const [bioInput, setBioInput] = useState(bio);
  const [error, setError] = useState("");
  const updateProfileMutation = useMutation({
    mutationFn: updateCurrentProfile,
    onSuccess: (updatedProfile) => {
      setError("");
      onUpdated(updatedProfile);
    },
    onError: (error) => {
      setError(
        error instanceof Error ? error.message : "Could not update profile."
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    updateProfileMutation.mutate({
      bio: bioInput,
      displayName: displayNameInput,
    });
  }

  return (
    <div
      aria-label="Edit profile"
      aria-modal="true"
      className={styles.modalBackdrop}
      role="dialog"
    >
      <section className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h2>Edit profile</h2>
          <button
            aria-label="Close edit profile"
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
              maxLength={80}
              onChange={(event) => setDisplayNameInput(event.target.value)}
              placeholder="Display name"
              required
              value={displayNameInput}
            />
          </label>

          <label>
            <textarea
              maxLength={160}
              onChange={(event) => setBioInput(event.target.value)}
              placeholder="Bio"
              rows={4}
              value={bioInput}
            />
          </label>

          <div className={styles.formFooter}>
            <p className={error ? styles.error : styles.idle}>{error}</p>
            <button disabled={updateProfileMutation.isPending} type="submit">
              {updateProfileMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
