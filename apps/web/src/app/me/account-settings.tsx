"use client";

import { signOutCurrentUser } from "@/lib/auth-client";
import styles from "./page.module.css";

type AccountSettingsProps = {
  onClose: () => void;
};

export function AccountSettings({ onClose }: AccountSettingsProps) {
  return (
    <div
      aria-label="Account settings"
      aria-modal="true"
      className={styles.fullScreenModal}
      role="dialog"
    >
      <div className={styles.fullScreenModalHeader}>
        <h2>Account settings</h2>
        <button
          aria-label="Close account settings"
          className={styles.modalClose}
          onClick={onClose}
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
  );
}
