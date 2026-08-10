import { SubscriptionList } from "@/features/subscriptions/subscription-list";
import { TopNav } from "../../top-nav";
import styles from "./page.module.css";

export default function SubscriptionsPage() {
  return (
    <main className={styles.page}>
      <TopNav />
      <section className={styles.content}>
        <h1>Subscriptions</h1>
        <SubscriptionList />
      </section>
    </main>
  );
}
