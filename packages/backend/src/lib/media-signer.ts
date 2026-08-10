import {
  GetParameterCommand,
  SSMClient
} from "@aws-sdk/client-ssm";
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

const ssmClient = new SSMClient({});

let privateKeyPromise: Promise<string> | undefined;

const getPrivateKey = async (parameterName: string) => {
  privateKeyPromise ??= (async () => {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true
      })
    );
    const privateKey = result.Parameter?.Value;

    if (!privateKey) {
      throw new Error("Media signing private key parameter is empty.");
    }

    return privateKey.replace(/\\n/g, "\n");
  })();

  return privateKeyPromise;
};

export type MediaSigningConfig = {
  baseUrl: string;
  keyPairId: string;
  privateKeyParameterName: string;
  expiresInSeconds: number;
};

export const getSignedCloudFrontUrl = async (
  url: string,
  config: MediaSigningConfig
) => {
  const privateKey = await getPrivateKey(config.privateKeyParameterName);

  return getSignedUrl({
    url,
    keyPairId: config.keyPairId,
    privateKey,
    dateLessThan: new Date(Date.now() + config.expiresInSeconds * 1000)
  });
};

export const getSignedCloudFrontUrlWithPolicy = async ({
  config,
  resourceUrl,
  url
}: {
  config: MediaSigningConfig;
  resourceUrl: string;
  url: string;
}) => {
  const privateKey = await getPrivateKey(config.privateKeyParameterName);
  const expiresAt = Math.floor(Date.now() / 1000) + config.expiresInSeconds;
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: resourceUrl,
        Condition: {
          DateLessThan: {
            "AWS:EpochTime": expiresAt
          }
        }
      }
    ]
  });

  return getSignedUrl({
    url,
    keyPairId: config.keyPairId,
    privateKey,
    policy
  });
};
