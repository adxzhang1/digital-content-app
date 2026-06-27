"use client";

import { useMutation } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useAuth } from "../auth-provider";
import { createFirebaseUser } from "@/lib/auth-client";
import { completeOnboarding } from "@/features/auth/account-api";
import styles from "./page.module.css";

type SignUpStep = "account" | "profile";

type Status = {
  tone: "idle" | "success" | "error";
  message: string;
};

type CreateAccountFormProps = {
  onAccountCreated: () => Promise<void> | void;
  onSignOut?: () => void;
  onSignIn: () => void;
};

export function CreateAccountForm({
  onAccountCreated,
  onSignOut,
  onSignIn,
}: CreateAccountFormProps) {
  const auth = useAuth();
  const [signUpStep, setSignUpStep] = useState<SignUpStep>(
    auth.firebaseUser ? "profile" : "account"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>({
    tone: "idle",
    message: "",
  });
  const onboardingMutation = useMutation({
    mutationFn: completeOnboarding,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (signUpStep === "account") {
        setStatus({
          tone: "idle",
          message: "Creating account...",
        });

        if (!auth.firebaseUser) {
          await createFirebaseUser(email.trim(), password);
        }

        setSignUpStep("profile");
        setStatus({
          tone: "idle",
          message: "Finish your profile to continue.",
        });
        return;
      }

      setStatus({
        tone: "idle",
        message: "Creating profile...",
      });
      await onboardingMutation.mutateAsync({
        displayName,
        username,
      });
      setStatus({
        tone: "success",
        message: "Account ready.",
      });
      await onAccountCreated();
    } catch (error) {
      setStatus({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Account creation failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <h1 className={styles.title}>
        {signUpStep === "profile" ? "Setup your profile" : "Sign up"}
      </h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        {!auth.firebaseUser && signUpStep === "account" ? (
          <>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
              type="email"
              value={email}
            />

            <input
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              type="password"
              value={password}
            />
          </>
        ) : null}

        {signUpStep === "profile" ? (
          <>
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              required
              value={username}
            />

            <input
              autoComplete="name"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
              required
              value={displayName}
            />
          </>
        ) : null}

        <div className={styles.footer}>
          <p className={styles[status.tone]}>{status.message}</p>
          {signUpStep === "account" ? (
            <p className={styles.disclaimer}>
              By signing up, you agree to our terms and privacy policy.
            </p>
          ) : null}
          <div className={styles.actions}>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Working..."
                : signUpStep === "account"
                  ? "Sign Up"
                  : "Continue"}
            </button>
            {!auth.firebaseUser && signUpStep === "account" ? (
              <button
                className={styles.secondaryAction}
                onClick={onSignIn}
                type="button"
              >
                Sign in
              </button>
            ) : null}
            {auth.firebaseUser && signUpStep === "profile" && onSignOut ? (
              <button
                className={styles.secondaryAction}
                onClick={() => void onSignOut()}
                type="button"
              >
                Log out
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </>
  );
}
