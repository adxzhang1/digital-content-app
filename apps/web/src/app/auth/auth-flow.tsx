"use client";

import { useEffect, useState } from "react";
import { getAuthSessionError, useAuth } from "../auth-provider";
import { signOutCurrentUser } from "@/lib/auth-client";
import { CreateAccountForm } from "./create-account-form";
import styles from "./page.module.css";
import { SignInForm } from "./sign-in-form";

type AuthView = "sign-in" | "create-account";

type AuthFlowProps = {
  onReady: () => void;
};

export function AuthFlow({ onReady }: AuthFlowProps) {
  const auth = useAuth();
  const [view, setView] = useState<AuthView>("sign-in");
  const sessionStatus = auth.session.status;

  useEffect(() => {
    if (sessionStatus === "ready") {
      onReady();
    }
  }, [onReady, sessionStatus]);

  async function handleSignOut() {
    await signOutCurrentUser();
    setView("sign-in");
  }

  async function handleAccountCreated() {
    const nextAccountState = await auth.refreshAccount({
      forceTokenRefresh: true,
    });

    if (nextAccountState === "ready") {
      onReady();
    }
  }

  if (sessionStatus === "checking_firebase") {
    return (
      <div aria-label="Loading" className={styles.flowLoading} role="status">
        <span className={styles.buttonSpinner} />
      </div>
    );
  }

  const showCreateAccount =
    sessionStatus === "needs_onboarding" || view === "create-account";
  const accountError = getAuthSessionError(auth.session);

  return (
    <div className={styles.flowContent}>
      {accountError ? <p className={styles.error}>{accountError}</p> : null}
      {!accountError && !showCreateAccount ? (
        <SignInForm
          isResolvingAccount={sessionStatus === "checking_account"}
          onCreateAccount={() => setView("create-account")}
        />
      ) : null}
      {!accountError && showCreateAccount ? (
        <CreateAccountForm
          onAccountCreated={handleAccountCreated}
          onSignOut={handleSignOut}
          onSignIn={() => setView("sign-in")}
        />
      ) : null}
    </div>
  );
}
