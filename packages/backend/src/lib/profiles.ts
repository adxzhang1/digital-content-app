import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { documentClient } from "./dynamodb.js";
import { getSignedProcessedMediaUrl } from "./posts.js";
import type { MediaSigningConfig } from "./media-signer.js";

export type ProfileRecord = Record<string, unknown> & {
  profileId: string;
};

export async function getProfileByUsername(
  profilesTableName: string,
  username: string
): Promise<ProfileRecord | undefined> {
  const usernameResult = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `USERNAME#${username}`,
        SK: "METADATA"
      }
    })
  );

  const profileId = usernameResult.Item?.profileId;

  if (!profileId) {
    return undefined;
  }

  const profileResult = await documentClient.send(
    new GetCommand({
      TableName: profilesTableName,
      Key: {
        PK: `PROFILE#${String(profileId)}`,
        SK: "METADATA"
      }
    })
  );

  return profileResult.Item as ProfileRecord | undefined;
}

const toProfilePictureResponse = async (
  profilePicture: unknown,
  signingConfig: MediaSigningConfig
) => {
  if (!profilePicture || typeof profilePicture !== "object") {
    return undefined;
  }

  const picture = profilePicture as Record<string, unknown>;

  return {
    imageId: String(picture.imageId ?? ""),
    url: await getSignedProcessedMediaUrl(signingConfig, picture.processedKey),
    width: Number(picture.width ?? 0),
    height: Number(picture.height ?? 0)
  };
};

export const toProfileResponse = async (
  profile: Record<string, unknown>,
  signingConfig: MediaSigningConfig
) => ({
  profileId: String(profile.profileId),
  userId: String(profile.userId),
  username: String(profile.username),
  displayName: String(profile.displayName),
  bio: String(profile.bio),
  counts: profile.counts as Record<string, unknown>,
  image: await toProfilePictureResponse(profile.image, signingConfig)
});
