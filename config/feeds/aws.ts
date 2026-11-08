import type { FeedInput } from './types';

const blog = (slug: string, id: string, name: string, extra: Partial<FeedInput> = {}): FeedInput => ({
  id,
  name,
  topic: 'aws',
  url: `https://aws.amazon.com/blogs/${slug}/feed/`,
  homepage: `https://aws.amazon.com/blogs/${slug}/`,
  expectCadenceDays: 21,
  ...extra,
});

export const awsFeeds: FeedInput[] = [
  {
    id: 'aws-whats-new',
    name: "AWS What's New",
    topic: 'aws',
    url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
    homepage: 'https://aws.amazon.com/about-aws/whats-new/recent/',
    expectCadenceDays: 2,
    notes: '~9 items/day in a 100-item feed, so ~11 days of headroom. Mostly release notes: the region-expansion hard-drop rules do the heavy lifting here.',
  },
  blog('aws', 'aws-news', 'AWS News Blog', { expectCadenceDays: 7 }),
  blog('architecture', 'aws-architecture', 'AWS Architecture'),
  blog('compute', 'aws-compute', 'AWS Compute'),
  blog('containers', 'aws-containers', 'AWS Containers'),
  blog('devops', 'aws-devops', 'AWS DevOps'),
  blog('big-data', 'aws-bigdata', 'AWS Big Data'),
  blog('database', 'aws-database', 'AWS Database'),
  blog('storage', 'aws-storage', 'AWS Storage'),
  blog('networking-and-content-delivery', 'aws-networking', 'AWS Networking & CDN'),
  blog('machine-learning', 'aws-ml', 'AWS Machine Learning'),
  blog('security', 'aws-security', 'AWS Security'),
  blog('mt', 'aws-mgmt', 'AWS Management Tools'),
  blog('hpc', 'aws-hpc', 'AWS HPC', { slow: true, expectCadenceDays: 60 }),
  blog('opensource', 'aws-opensource', 'AWS Open Source', { slow: true, expectCadenceDays: 45 }),
];
