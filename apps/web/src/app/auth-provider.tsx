"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, onAuthStateChanged } from "firebase/auth";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { firebaseAuth } from "@/lib/firebase";
import {
  accountQueryKey,
  fetchAccount,
  type AppAccount,
} from "@/features/auth/account-api";
import {
  postDetailQueryRoot,
  profilePostsQueryRoot,
} from "@/features/profile/profile-post-api";

export type AccountState = "unauthenticated" | "needs_onboarding" | "ready";

export type AuthSessionState =
  | { status: "checking_firebase" }
  | { status: "unauthenticated" }
  | { status: "checking_account"; firebaseUser: User }
  | { status: "needs_onboarding"; firebaseUser: User }
  | { status: "ready"; account: AppAccount; firebaseUser: User }
  | { status: "error"; firebaseUser: User | null; message: string };

type AuthContextValue = {
  account: AppAccount | null;
  firebaseUser: User | null;
  refreshAccount: (options?: {
    forceTokenRefresh?: boolean;
  }) => Promise<AccountState>;
  session: AuthSessionState;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const getAuthSessionError = (session: AuthSessionState) =>
  session.status === "error" ? session.message : "";

export const isAuthSessionReady = (session: AuthSessionState) =>
  session.status === "ready";

export const isAuthSessionLoading = (session: AuthSessionState) =>
  session.status === "checking_firebase" ||
  session.status === "checking_account";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isCheckingFirebase, setIsCheckingFirebase] = useState(true);
  const accountQuery = useQuery({
    enabled: Boolean(firebaseUser),
    queryKey: firebaseUser ? accountQueryKey(firebaseUser.uid) : ["account"],
    queryFn: () => {
      if (!firebaseUser) {
        throw new Error("Sign in to continue.");
      }

      return fetchAccount(firebaseUser);
    },
  });

  const refreshAccount = useCallback(async (options?: {
    forceTokenRefresh?: boolean;
  }): Promise<AccountState> => {
    const firebaseUser = firebaseAuth.currentUser;

    if (!firebaseUser) {
      queryClient.removeQueries({ queryKey: ["account"] });
      return "unauthenticated";
    }

    try {
      const account = await queryClient.fetchQuery({
        queryKey: accountQueryKey(firebaseUser.uid),
        queryFn: () => fetchAccount(firebaseUser, options),
        staleTime: 0,
      });

      return account.status === "ready" ? "ready" : "needs_onboarding";
    } catch {
      return "unauthenticated";
    }
  }, [queryClient]);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      queryClient.removeQueries({ queryKey: ["account"] });
      queryClient.removeQueries({ queryKey: profilePostsQueryRoot });
      queryClient.removeQueries({ queryKey: postDetailQueryRoot });
      setFirebaseUser(nextUser);
      setIsCheckingFirebase(false);
    });
  }, [queryClient]);

  const session = useMemo<AuthSessionState>(() => {
    if (isCheckingFirebase) {
      return { status: "checking_firebase" };
    }

    if (!firebaseUser) {
      return { status: "unauthenticated" };
    }

    if (accountQuery.isPending) {
      return { status: "checking_account", firebaseUser };
    }

    if (accountQuery.isError) {
      return {
        firebaseUser,
        message:
          accountQuery.error instanceof Error
            ? accountQuery.error.message
            : "Could not load account.",
        status: "error",
      };
    }

    if (accountQuery.data.status === "needs_onboarding") {
      return { status: "needs_onboarding", firebaseUser };
    }

    return {
      account: accountQuery.data.user,
      firebaseUser,
      status: "ready",
    };
  }, [
    accountQuery.data,
    accountQuery.error,
    accountQuery.isError,
    accountQuery.isPending,
    firebaseUser,
    isCheckingFirebase,
  ]);

  const account = session.status === "ready" ? session.account : null;

  const value = useMemo(
    () => ({
      account,
      firebaseUser,
      refreshAccount,
      session,
    }),
    [account, firebaseUser, refreshAccount, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
