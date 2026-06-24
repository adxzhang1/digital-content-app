"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { TopNav } from "../top-nav";
import { AuthFlow } from "./auth-flow";
import styles from "./page.module.css";

export default function AuthPage() {
  const router = useRouter();
  const handleReady = useCallback(() => {
    router.push("/me");
  }, [router]);

  return (
    <main className={styles.page}>
      <TopNav />
      <section className={styles.panel}>
        <AuthFlow onReady={handleReady} />
      </section>
    </main>
  );
}
