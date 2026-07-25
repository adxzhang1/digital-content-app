import { PostFeedPage } from "./post-feed-page";

type PostFeedRouteProps = {
  params: Promise<{
    postId: string;
    username: string;
  }>;
};

export default async function PostFeedRoute({ params }: PostFeedRouteProps) {
  const { postId, username } = await params;

  return <PostFeedPage initialPostId={postId} username={username} />;
}
