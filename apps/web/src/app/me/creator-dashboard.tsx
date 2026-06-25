"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isAuthSessionLoading,
  isAuthSessionReady,
  useAuth,
} from "../auth-provider";
import { ProfilePostGrid } from "../profiles/[username]/profile-post-grid";
import type { Profile } from "../profiles/[username]/profile-data";
import { signOutCurrentUser } from "@/lib/auth-client";
import { publicConfig } from "@/lib/config";
import { CreatePostForm } from "./create-post-form";
import styles from "./page.module.css";

const apiBaseUrl = publicConfig.apiBaseUrl;

export function CreatorDashboard() {
  const auth = useAuth();
  const router = useRouter();
  const isAccountLoading = isAuthSessionLoading(auth.session);
  const isAccountReady = isAuthSessionReady(auth.session);
  const username = auth.account?.username;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const activeProfile = profile?.username === username ? profile : null;

  useEffect(() => {
    if (!isAccountReady || !username) {
      return;
    }

    let isActive = true;

    async function loadProfile() {
      const response = await fetch(`${apiBaseUrl}/profiles/${username}`);
      const data = (await response.json()) as {
        profile?: Profile;
      };

      if (isActive && response.ok && data.profile) {
        setProfile(data.profile);
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [isAccountReady, username]);

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
        </div>

        <div className={styles.profileActions}>
          <button
            aria-label="Account options"
            className={styles.menuButton}
            onClick={() => setIsAccountMenuOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
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
          <section className={styles.createPostModal}>
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
            <CreatePostForm profileId={auth.account.profileId} />
          </section>
        </div>
      ) : null}

      {isAccountMenuOpen ? (
        <div
          aria-label="Account options"
          aria-modal="true"
          className={styles.fullScreenModal}
          role="dialog"
        >
          <div className={styles.fullScreenModalHeader}>
            <h2>Account</h2>
            <button
              aria-label="Close account options"
              className={styles.modalClose}
              onClick={() => setIsAccountMenuOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <button
            className={styles.logoutAction}
            onClick={() => void signOutCurrentUser()}
            type="button"
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
