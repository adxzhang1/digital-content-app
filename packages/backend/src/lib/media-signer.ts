import {
  GetSecretValueCommand,
  SecretsManagerClient
} from "@aws-sdk/client-secrets-manager";
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const secretsManagerClient = new SecretsManagerClient({});

let privateKeyPromise: Promise<string> | undefined;

const normalizePrivateKey = (secretValue: string) => {
  try {
    const parsed = JSON.parse(secretValue) as { privateKey?: unknown };

    if (typeof parsed.privateKey === "string") {
      return parsed.privateKey.replace(/\\n/g, "\n");
    }
  } catch {
    return secretValue.replace(/\\n/g, "\n");
  }

  return secretValue.replace(/\\n/g, "\n");
};

const getPrivateKey = async (secretName: string) => {
  privateKeyPromise ??= (async () => {
    const result = await secretsManagerClient.send(
      new GetSecretValueCommand({
        SecretId: secretName
      })
    );

    if (!result.SecretString) {
      throw new Error("Media signing private key secret is empty.");
    }

    return normalizePrivateKey(result.SecretString);
  })();

  return privateKeyPromise;
};

export type MediaSigningConfig = {
  baseUrl: string;
  keyPairId: string;
  keySecretName: string;
  expiresInSeconds: number;
};

export const getSignedCloudFrontUrl = async (
  url: string,
  config: MediaSigningConfig
) => {
  const privateKey = await getPrivateKey(config.keySecretName);

  return getSignedUrl({
    url,
    keyPairId: config.keyPairId,
    privateKey,
    dateLessThan: new Date(Date.now() + config.expiresInSeconds * 1000)
  });
};
