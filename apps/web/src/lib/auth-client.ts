"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { firebaseAuth } from "./firebase";

export async function getCurrentIdToken(forceRefresh = false) {
  if (!firebaseAuth?.currentUser) {
    throw new Error("Sign in to continue.");
  }

  return firebaseAuth.currentUser.getIdToken(forceRefresh);
}

export async function signInWithPassword(email: string, password: string) {
  await signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function createFirebaseUser(email: string, password: string) {
  await createUserWithEmailAndPassword(firebaseAuth, email, password);
}

export async function signOutCurrentUser() {
  await signOut(firebaseAuth);
}
