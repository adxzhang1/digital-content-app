export type Profile = {
  profileId: string;
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  counts: {
    posts: number;
    likes: string;
  };
};

export type ProfilePostMedia = {
  mediaId: string;
  position: number;
  type: string;
  processedKey?: string;
  url?: string;
  width: number;
  height: number;
};

export type ProfilePostSummary = {
  postId: string;
  profileId: string;
  caption: string;
  status: string;
  thumbnail: ProfilePostMedia | null;
  mediaCount: number;
  createdAt: string;
  likeCount: number;
};

export type ProfilePostDetail = Omit<ProfilePostSummary, "thumbnail"> & {
  thumbnail?: ProfilePostMedia | null;
  media: ProfilePostMedia[];
  updatedAt?: string;
};
