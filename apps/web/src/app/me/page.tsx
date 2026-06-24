import { TopNav } from "../top-nav";
import { CreatorDashboard } from "./creator-dashboard";
import styles from "./page.module.css";

export default function MePage() {
  return (
    <main className={styles.page}>
      <TopNav />

      <CreatorDashboard />
    </main>
  );
}
