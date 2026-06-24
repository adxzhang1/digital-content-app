"use client";

import Link from "next/link";
import { isAuthSessionReady, useAuth } from "./auth-provider";
import styles from "./top-nav.module.css";

export function TopNav() {
  const auth = useAuth();
  const profileHref = isAuthSessionReady(auth.session) ? "/me" : "/auth";

  return (
    <nav className={styles.topNav}>
      <Link aria-label="Home" className={styles.iconLink} href="/">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m3 10.5 9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      </Link>

      <Link
        aria-label="My profile"
        className={`${styles.iconLink} ${styles.profileLink}`}
        href={profileHref}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </Link>
    </nav>
  );
}
