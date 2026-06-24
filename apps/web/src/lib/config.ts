function requireConfigValue(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export const publicConfig = {
  apiBaseUrl: requireConfigValue(
    process.env.NEXT_PUBLIC_API_URL,
    "NEXT_PUBLIC_API_URL"
  ),
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },
};
