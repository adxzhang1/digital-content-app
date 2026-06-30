export type ProfilePicture = {
  imageId: string;
  url?: string;
  width: number;
  height: number;
};

export type Profile = {
  profileId: string;
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  image?: ProfilePicture;
  counts: {
    posts: number;
    likes: string;
  };
};

export type ProfilePostMedia = {
  mediaId: string;
  position: number;
  type: string;
  url?: string;
  sources?: {
    hls?: {
      url?: string;
      renditions?: {
        [name: string]: {
          width?: number;
          height?: number;
        };
      };
    };
  };
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
  media: ProfilePostMedia[];
  updatedAt?: string;
};
