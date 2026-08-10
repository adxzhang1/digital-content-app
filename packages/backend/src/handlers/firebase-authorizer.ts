import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult
} from "aws-lambda";
import {
  GetParameterCommand,
  SSMClient
} from "@aws-sdk/client-ssm";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { documentClient } from "../lib/dynamodb.js";
import { requireEnv } from "../lib/env.js";
import type { AuthenticatedUser } from "../lib/auth.js";

const firebaseProjectId = requireEnv("FIREBASE_PROJECT_ID");
const firebaseServiceAccountParameterName = requireEnv(
  "FIREBASE_SERVICE_ACCOUNT_PARAMETER_NAME"
);
const usersTableName = requireEnv("USERS_TABLE_NAME");
const ssmClient = new SSMClient({});

let firebaseAppPromise: Promise<void> | undefined;

const initializeFirebaseApp = async () => {
  if (getApps().length > 0) {
    return;
  }

  firebaseAppPromise ??= (async () => {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: firebaseServiceAccountParameterName,
        WithDecryption: true
      })
    );
    const serviceAccount = result.Parameter?.Value;

    if (!serviceAccount) {
      throw new Error("Firebase service account parameter is empty.");
    }

    initializeApp({
      credential: cert(JSON.parse(serviceAccount) as object),
      projectId: firebaseProjectId
    });
  })();

  await firebaseAppPromise;
};

const unauthorized = (): APIGatewaySimpleAuthorizerWithContextResult<AuthenticatedUser> => ({
  isAuthorized: false,
  context: {
    firebaseUid: ""
  }
});

const getBearerToken = (authorizationHeader?: string) => {
  const [scheme, token] = authorizationHeader?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
};

const getHeader = (
  headers: APIGatewayRequestAuthorizerEventV2["headers"],
  headerName: string
) => {
  const normalizedHeaderName = headerName.toLowerCase();

  return Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === normalizedHeaderName
  )?.[1];
};

const resolveInternalUser = async (
  firebaseUid: string
): Promise<Pick<AuthenticatedUser, "userId" | "profileId">> => {
  const result = await documentClient.send(
    new GetCommand({
      TableName: usersTableName,
      Key: {
        PK: `FIREBASE_UID#${firebaseUid}`,
        SK: "METADATA"
      }
    })
  );

  if (!result.Item) {
    return {};
  }

  return {
    userId: String(result.Item.userId),
    profileId: String(result.Item.profileId)
  };
};

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthenticatedUser>> {
  try {
    const token = getBearerToken(getHeader(event.headers, "authorization"));

    if (!token) {
      return unauthorized();
    }

    await initializeFirebaseApp();

    const decodedToken = await getAuth().verifyIdToken(token);
    const internalUser = await resolveInternalUser(decodedToken.uid);

    return {
      isAuthorized: true,
      context: {
        firebaseUid: decodedToken.uid,
        email: decodedToken.email ?? "",
        ...internalUser
      }
    };
  } catch {
    return unauthorized();
  }
}
