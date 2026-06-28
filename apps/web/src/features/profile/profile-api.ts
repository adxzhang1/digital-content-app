import { publicConfig } from "@/lib/config";
import { getCurrentIdToken } from "@/lib/auth-client";
import type { Profile } from "./profile-data";

export type { Profile } from "./profile-data";

const apiBaseUrl = publicConfig.apiBaseUrl;

const allowedProfilePictureTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const profileQueryKey = (username: string) => ["profile", username];

type ProfilePictureContentType = (typeof allowedProfilePictureTypes)[number];

type ProfilePictureStatus = {
  imageId: string;
  profileId: string;
  status: string;
  width?: number;
  height?: number;
  createdAt?: string;
  updatedAt?: string;
};

function isProfilePictureContentType(
  contentType: string
): contentType is ProfilePictureContentType {
  return allowedProfilePictureTypes.includes(
    contentType as ProfilePictureContentType
  );
}

export async function getProfile(
  username: string,
  init?: RequestInit
): Promise<Profile | null> {
  const response = await fetch(`${apiBaseUrl}/profiles/${username}`, init);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Could not load profile.");
  }

  const data = (await response.json()) as {
    profile?: Profile;
    message?: string;
  };

  if (!data.profile) {
    throw new Error(data.message ?? "Could not load profile.");
  }

  return data.profile;
}

export async function updateCurrentProfile({
  bio,
  displayName,
}: {
  bio: string;
  displayName: string;
}) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/me/profile`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      bio,
      displayName,
    }),
  });
  const data = (await response.json()) as {
    profile?: Profile;
    message?: string;
  };

  if (!response.ok || !data.profile) {
    throw new Error(data.message ?? "Could not update profile.");
  }

  return data.profile;
}

export async function createProfilePictureUpload(file: File) {
  if (!isProfilePictureContentType(file.type)) {
    throw new Error("Profile picture must be JPEG, PNG, or WebP.");
  }

  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/me/profile-picture`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contentType: file.type,
    }),
  });
  const data = (await response.json()) as {
    profilePicture?: ProfilePictureStatus;
    uploadUrl?: string;
    message?: string;
  };

  if (!response.ok || !data.profilePicture?.imageId || !data.uploadUrl) {
    throw new Error(data.message ?? "Could not prepare profile picture upload.");
  }

  return {
    imageId: data.profilePicture.imageId,
    uploadUrl: data.uploadUrl,
  };
}

export function uploadProfilePictureFile(
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error("Profile picture upload failed."));
    });
    request.addEventListener("error", () =>
      reject(new Error("Profile picture upload failed."))
    );
    request.open("PUT", uploadUrl);
    request.setRequestHeader("content-type", file.type);
    request.send(file);
  });
}

export async function completeProfilePictureUpload({
  imageId,
}: {
  imageId: string;
}) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/me/profile-picture/complete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      imageId,
    }),
  });
  const data = (await response.json()) as {
    profilePicture?: ProfilePictureStatus;
    message?: string;
  };

  if (!response.ok || !data.profilePicture) {
    throw new Error(data.message ?? "Could not complete profile picture upload.");
  }

  return data.profilePicture;
}

export async function getProfilePictureStatus(imageId: string) {
  const idToken = await getCurrentIdToken();
  const response = await fetch(`${apiBaseUrl}/me/profile-picture/${imageId}`, {
    headers: {
      authorization: `Bearer ${idToken}`,
    },
  });
  const data = (await response.json()) as {
    profilePicture?: ProfilePictureStatus;
    message?: string;
  };

  if (!response.ok || !data.profilePicture) {
    throw new Error(data.message ?? "Could not load profile picture status.");
  }

  return data.profilePicture;
}

export async function waitForProfilePicture({
  imageId,
  username,
}: {
  imageId: string;
  username: string;
}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const profilePicture = await getProfilePictureStatus(imageId);

    if (profilePicture.status === "READY") {
      const profile = await getProfile(username);

      if (profile) {
        return profile;
      }
    }

    if (profilePicture.status === "FAILED") {
      throw new Error("Profile picture processing failed.");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }

  throw new Error("Profile picture is still processing. Check back shortly.");
}
