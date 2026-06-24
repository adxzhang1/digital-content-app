"use client";

import { User, onAuthStateChanged } from "firebase/auth";
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { firebaseAuth } from "@/lib/firebase";
import { publicConfig } from "@/lib/config";

export type AccountState = "unauthenticated" | "needs_onboarding" | "ready";

export type AppAccount = {
  userId: string;
  profileId: string;
  username: string;
  email: string;
};

export type AuthSessionState =
  | { status: "checking_firebase" }
  | { status: "unauthenticated" }
  | { status: "checking_account"; firebaseUser: User }
  | { status: "needs_onboarding"; firebaseUser: User }
  | { status: "ready"; account: AppAccount; firebaseUser: User }
  | { status: "error"; firebaseUser: User | null; message: string };

type MeResponse = {
  status?: "ready" | "needs_onboarding";
  user?: AppAccount;
  message?: string;
};

type AuthContextValue = {
  account: AppAccount | null;
  firebaseUser: User | null;
  refreshAccount: (options?: {
    forceTokenRefresh?: boolean;
  }) => Promise<AccountState>;
  session: AuthSessionState;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const apiBaseUrl = publicConfig.apiBaseUrl;
const initialSession: AuthSessionState = { status: "checking_firebase" };

export const getAuthSessionError = (session: AuthSessionState) =>
  session.status === "error" ? session.message : "";

export const isAuthSessionReady = (session: AuthSessionState) =>
  session.status === "ready";

export const isAuthSessionLoading = (session: AuthSessionState) =>
  session.status === "checking_firebase" ||
  session.status === "checking_account";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] =
    useState<AuthSessionState>(initialSession);
  const accountRequestIdRef = useRef(0);
  const inFlightAccountRequestRef = useRef<{
    firebaseUid: string;
    promise: Promise<AccountState>;
    requestId: number;
  } | null>(null);

  const loadAccount = useCallback(
    async (
      firebaseUser: User,
      options?: {
        forceTokenRefresh?: boolean;
      }
    ): Promise<AccountState> => {
      if (
        !options?.forceTokenRefresh &&
        inFlightAccountRequestRef.current?.firebaseUid === firebaseUser.uid
      ) {
        return inFlightAccountRequestRef.current.promise;
      }

      const requestId = accountRequestIdRef.current + 1;
      accountRequestIdRef.current = requestId;
      setSessionState({ status: "checking_account", firebaseUser });

      const promise = (async () => {
        try {
          const idToken = await firebaseUser.getIdToken(
            options?.forceTokenRefresh
          );
          const response = await fetch(`${apiBaseUrl}/me`, {
            headers: {
              authorization: `Bearer ${idToken}`,
            },
          });
          const data = (await response.json()) as MeResponse;

          if (!response.ok) {
            throw new Error(data.message ?? "Could not load account.");
          }

          if (data.status === "needs_onboarding") {
            if (accountRequestIdRef.current === requestId) {
              setSessionState({ status: "needs_onboarding", firebaseUser });
            }

            return "needs_onboarding";
          }

          if (data.status !== "ready" || !data.user) {
            throw new Error("Could not load account.");
          }

          if (accountRequestIdRef.current === requestId) {
            setSessionState({
              account: data.user,
              firebaseUser,
              status: "ready",
            });
          }

          return "ready";
        } catch (error) {
          if (accountRequestIdRef.current === requestId) {
            setSessionState({
              firebaseUser,
              message:
                error instanceof Error
                  ? error.message
                  : "Could not load account.",
              status: "error",
            });
          }

          return "unauthenticated";
        } finally {
          if (inFlightAccountRequestRef.current?.requestId === requestId) {
            inFlightAccountRequestRef.current = null;
          }
        }
      })();

      inFlightAccountRequestRef.current = {
        firebaseUid: firebaseUser.uid,
        promise,
        requestId,
      };

      return promise;
    },
    []
  );

  const refreshAccount = useCallback(async (options?: {
    forceTokenRefresh?: boolean;
  }): Promise<AccountState> => {
    const firebaseUser = firebaseAuth.currentUser;

    if (!firebaseUser) {
      accountRequestIdRef.current += 1;
      inFlightAccountRequestRef.current = null;
      setSessionState({ status: "unauthenticated" });
      return "unauthenticated";
    }

    return loadAccount(firebaseUser, options);
  }, [loadAccount]);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      accountRequestIdRef.current += 1;
      inFlightAccountRequestRef.current = null;

      if (!nextUser) {
        setSessionState({ status: "unauthenticated" });
        return;
      }

      void loadAccount(nextUser);
    });
  }, [loadAccount]);

  const account = session.status === "ready" ? session.account : null;
  const firebaseUser =
    "firebaseUser" in session ? session.firebaseUser : null;

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
