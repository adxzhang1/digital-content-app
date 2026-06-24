"use client";

import { FormEvent, useState } from "react";
import { signInWithPassword } from "@/lib/auth-client";
import styles from "./page.module.css";

type Status = {
  tone: "idle" | "error";
  message: string;
};

type SignInFormProps = {
  isResolvingAccount?: boolean;
  onCreateAccount: () => void;
};

export function SignInForm({
  isResolvingAccount = false,
  onCreateAccount,
}: SignInFormProps) {
  const [email, setEmail] = useState("test@gmail.com");
  const [password, setPassword] = useState("test123");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>({
    tone: "idle",
    message: "",
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      setStatus({
        tone: "idle",
        message: "",
      });

      await signInWithPassword(email.trim(), password);
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Authentication failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const showSpinner = isSubmitting || isResolvingAccount;

  return (
    <>
      <h1 className={styles.title}>Log in</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          required
          type="email"
          value={email}
        />

        <input
          autoComplete="current-password"
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          type="password"
          value={password}
        />

        <div className={styles.footer}>
          <p className={styles[status.tone]}>{status.message}</p>
          <div className={styles.actions}>
            <button disabled={showSpinner} type="submit">
              {showSpinner ? (
                <span aria-label="Signing in" className={styles.buttonSpinner} />
              ) : (
                "Sign in"
              )}
            </button>
            <button
              className={styles.secondaryAction}
              onClick={onCreateAccount}
              type="button"
            >
              Create account
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
