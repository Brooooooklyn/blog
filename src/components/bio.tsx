/**
 * Bio component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from 'react'
import { useStaticQuery, graphql } from 'gatsby'
import Image from 'gatsby-image'

import { rhythm } from '../utils/typography'
import Github from '../assets/github.svg'
import Solution from '../assets/solution.svg'
import Twitter from '../assets/twitter.svg'
import Zhihu from '../assets/zhihu.svg'

const Bio = () => {
  const data = useStaticQuery(graphql`
    query BioQuery {
      avatar: file(absolutePath: { regex: "/profile-pic.jpg/" }) {
        childImageSharp {
          fixed(width: 50, height: 50) {
            ...GatsbyImageSharpFixed
          }
        }
      }
      site {
        siteMetadata {
          author {
            name
            summary
          }
          social {
            twitter
            github
            resume
          }
        }
      }
    }
  `)

  const { author, social } = data.site.siteMetadata
  return (
    <>
      <div
        style={{
          display: `flex`,
        }}
      >
        <Image
          fixed={data.avatar.childImageSharp.fixed}
          alt={author.name}
          style={{
            marginRight: rhythm(1 / 2),
            marginBottom: 0,
            minWidth: 50,
            borderRadius: `100%`,
          }}
          imgStyle={{
            borderRadius: `50%`,
          }}
        />
        <p>
          Written by <strong>{author.name}</strong>
          <br />
          {author.summary}
        </p>
      </div>
      <div
        style={{
          display: `flex`,
        }}
      >
        <Link href={`https://twitter.com/${social.twitter}`}>
          <Twitter width={36} height={36} />
        </Link>
        <Link href={social.resume}>
          <Solution width={36} height={36} />
        </Link>
        <Link href={`https://github.com/${social.github}`}>
          <Github width={36} height={36} />
        </Link>
        <Link href={`https://www.zhihu.com/people/${social.zhihu}`}>
          <Zhihu width={36} height={36} />
        </Link>
      </div>
    </>
  )
}

function Link({
  children,
  href,
}: {
  children: React.ReactChild
  href: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      style={{ boxShadow: 'none', marginRight: '10px' }}
    >
      {children}
    </a>
  )
}

export default Bio
