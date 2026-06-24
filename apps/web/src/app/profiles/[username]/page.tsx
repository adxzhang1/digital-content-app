import { notFound } from "next/navigation";
import { publicConfig } from "@/lib/config";
import { TopNav } from "../../top-nav";
import styles from "./page.module.css";
import { ProfilePostGrid } from "./profile-post-grid";
import { type Profile } from "./profile-data";

type ProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
};

const apiBaseUrl = publicConfig.apiBaseUrl;

async function getProfile(username: string): Promise<Profile> {
  const profileUrl = `${apiBaseUrl}/profiles/${username}`;

  const response = await fetch(profileUrl, {
    cache: "no-store",
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error("Could not load profile.");
  }

  const data = (await response.json()) as { profile: Profile };
  return data.profile;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params;
  const profile = await getProfile(username);

  return (
    <main className={styles.page}>
      <TopNav />

      <div className={styles.content}>
        <section className={styles.profile} aria-label="Profile">
          <div className={styles.avatarColumn}>
            <div className={styles.avatar} aria-hidden="true" />
          </div>

          <div className={styles.profileMain}>
            <h1>{profile.username}</h1>

            <dl className={styles.counts} aria-label="Profile counts">
              <div>
                <dd>{profile.counts.posts}</dd>
                <dt>posts</dt>
              </div>
              <div>
                <dd>{profile.counts.likes}</dd>
                <dt>likes</dt>
              </div>
            </dl>
          </div>

          <div className={styles.bio}>
            <strong>{profile.displayName}</strong>
            <p>{profile.bio}</p>
          </div>
        </section>

        <section className={styles.feed} aria-label="Posts">
          <div className={styles.feedTabs}>
            <span>Posts</span>
          </div>

          <ProfilePostGrid username={profile.username} />
        </section>
      </div>
    </main>
  );
}
