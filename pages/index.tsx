import type { Props } from "./index.server"
import Bio from "../src/components/Bio"
import PostList from "../src/components/PostList"

export default function HomePage({ posts }: Props) {
  return (
    <>
      <Bio lang="en" />
      <div className="mt-14">
        <PostList posts={posts} lang="en" />
      </div>
    </>
  )
}
