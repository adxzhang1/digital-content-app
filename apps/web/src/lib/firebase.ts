"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { publicConfig } from "./config";

const firebaseConfig = publicConfig.firebase;

Object.entries(firebaseConfig).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Firebase config value ${key} is required.`);
  }
});

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
