import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { json } from "./http.js";

export type AuthenticatedUser = {
  firebaseUid: string;
  email?: string;
  userId?: string;
  profileId?: string;
};

export type OnboardedUser = AuthenticatedUser & {
  userId: string;
  profileId: string;
};

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const authErrorResponse = (
  error: unknown
): APIGatewayProxyStructuredResultV2 | undefined => {
  if (!(error instanceof AuthError)) {
    return undefined;
  }

  return json(error.statusCode, {
    code: error.code,
    message: error.message
  });
};

type LambdaAuthorizerContext = {
  authorizer?: {
    lambda?: AuthenticatedUser;
  };
};

export const getAuthenticatedUser = (
  event: APIGatewayProxyEventV2
): AuthenticatedUser | undefined => {
  const requestContext = event.requestContext as LambdaAuthorizerContext;

  return requestContext.authorizer?.lambda;
};

export const requireOnboarded = (
  user: AuthenticatedUser | undefined
): OnboardedUser => {
  if (!user?.firebaseUid) {
    throw new AuthError(
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication is required."
    );
  }

  if (!user.userId || !user.profileId) {
    throw new AuthError(
      403,
      "ONBOARDING_REQUIRED",
      "Complete account setup before using this endpoint."
    );
  }

  return {
    ...user,
    userId: user.userId,
    profileId: user.profileId
  };
};

export const requireOnboardedUser = (
  event: APIGatewayProxyEventV2
): OnboardedUser => requireOnboarded(getAuthenticatedUser(event));

export const userOwnsProfile = (
  user: AuthenticatedUser,
  profileId: string
) => user.profileId === profileId;
