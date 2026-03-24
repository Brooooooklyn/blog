import type { Props } from "./index.server"
import Bio from "../../src/components/Bio"
import PostList from "../../src/components/PostList"

export default function ZhHomePage({ posts }: Props) {
  return (
    <>
      <Bio lang="zh" />
      <div className="mt-14">
        <PostList posts={posts} lang="zh" />
      </div>
    </>
  )
}
