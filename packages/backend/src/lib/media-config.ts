import { requireEnv } from "./env.js";
import type { MediaSigningConfig } from "./media-signer.js";

const defaultSignedUrlTtlSeconds = 60 * 15;

export const getMediaSigningConfig = (): MediaSigningConfig => ({
  baseUrl: requireEnv("MEDIA_BASE_URL"),
  keyPairId: requireEnv("MEDIA_SIGNING_KEY_PAIR_ID"),
  keySecretName: requireEnv("MEDIA_SIGNING_KEY_SECRET_NAME"),
  expiresInSeconds: defaultSignedUrlTtlSeconds
});
