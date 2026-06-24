import { TopNav } from "./top-nav";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <TopNav />

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Digital Content</p>
        <h1>Exclusive content from creators</h1>
        <p className={styles.copy}>Try it out</p>
      </section>
    </main>
  );
}
