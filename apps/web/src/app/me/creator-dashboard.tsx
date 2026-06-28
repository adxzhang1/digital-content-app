"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "../auth-provider";
import { ProfilePostGrid } from "../profiles/[username]/profile-post-grid";
import {
  getProfile,
  type Profile,
  profileQueryKey,
} from "@/features/profile/profile-api";
import { AccountSettings } from "./account-settings";
import { CreatePostForm } from "./create-post-form";
import { EditProfileForm } from "./edit-profile-form";
import styles from "./page.module.css";

export function CreatorDashboard() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isAccountLoading = isAuthSessionLoading(auth.session);
  const isAccountReady = isAuthSessionReady(auth.session);
  const username = auth.account?.username;
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const profileQuery = useQuery({
    enabled: Boolean(isAccountReady && username),
    queryKey: username ? profileQueryKey(username) : ["profile"],
    queryFn: () => {
      if (!username) {
        throw new Error("Could not load profile.");
      }

      return getProfile(username);
    },
  });
  const profile = profileQuery.data ?? null;
  const activeProfile = profile?.username === username ? profile : null;

  useEffect(() => {
    if (!isAccountLoading && !isAccountReady) {
      router.replace("/auth");
    }
  }, [isAccountLoading, isAccountReady, router]);

  if (isAccountLoading || !isAccountReady || !auth.account) {
    return (
      <div className={styles.creatorLoading} aria-label="Loading" role="status">
        <span />
      </div>
    );
  }

  const displayName = activeProfile?.displayName ?? auth.account.displayName;
  const bio = activeProfile?.bio ?? "";
  const postCount = activeProfile?.counts.posts ?? 0;
  const likeCount = activeProfile?.counts.likes ?? "0";

  function handleEditProfileOpen() {
    setIsEditProfileOpen(true);
  }

  function handleProfileUpdated(updatedProfile: Profile) {
    queryClient.setQueryData(
      profileQueryKey(updatedProfile.username),
      updatedProfile
    );
    setIsEditProfileOpen(false);
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.profileHeader} aria-label="Your profile">
        <div className={styles.avatarColumn}>
          <div className={styles.avatar} aria-hidden="true" />
        </div>

        <div className={styles.profileMain}>
          <h1>{auth.account.username}</h1>
          <dl className={styles.counts}>
            <div>
              <dd>{postCount}</dd>
              <dt>posts</dt>
            </div>
            <div>
              <dd>{likeCount}</dd>
              <dt>likes</dt>
            </div>
          </dl>
        </div>

        <div className={styles.profileBio}>
          <strong>{displayName}</strong>
          {bio ? <p>{bio}</p> : null}
          <div className={styles.profileActions}>
            <button
              className={styles.editProfileButton}
              onClick={handleEditProfileOpen}
              type="button"
            >
              Edit profile
            </button>
            <button
              aria-label="Account settings"
              className={styles.settingsButton}
              onClick={() => setIsAccountSettingsOpen(true)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.08A1.7 1.7 0 0 0 4.64 8.9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 10.04 3V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section className={styles.postsSection} aria-label="Your posts">
        <div className={styles.postsHeader}>
          <h2>Posts</h2>
          <button
            className={styles.createButton}
            aria-label="Create post"
            onClick={() => setIsCreatePostOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <ProfilePostGrid username={auth.account.username} />
      </section>

      {isCreatePostOpen ? (
        <div
          aria-label="Create post"
          aria-modal="true"
          className={styles.modalBackdrop}
          role="dialog"
        >
          <section className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <h2>Create post</h2>
              <button
                aria-label="Close create post"
                className={styles.modalClose}
                onClick={() => setIsCreatePostOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <CreatePostForm
              profileId={auth.account.profileId}
              username={auth.account.username}
            />
          </section>
        </div>
      ) : null}

      {isEditProfileOpen ? (
        <EditProfileForm
          bio={bio}
          displayName={displayName}
          onClose={() => setIsEditProfileOpen(false)}
          onUpdated={handleProfileUpdated}
        />
      ) : null}

      {isAccountSettingsOpen ? (
        <AccountSettings onClose={() => setIsAccountSettingsOpen(false)} />
      ) : null}
    </div>
  );
}
