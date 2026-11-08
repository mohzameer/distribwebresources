import type { FeedInput } from './types';
import { ghReleases } from './types';

export const devopsFeeds: FeedInput[] = [
  { id: 'kubernetes-blog', name: 'Kubernetes Blog', topic: 'devops', url: 'https://kubernetes.io/feed.xml', homepage: 'https://kubernetes.io/blog/', expectCadenceDays: 14 },
  { id: 'cncf', name: 'CNCF', topic: 'devops', url: 'https://www.cncf.io/feed/', homepage: 'https://www.cncf.io/blog/', expectCadenceDays: 7 },
  { id: 'docker', name: 'Docker', topic: 'devops', url: 'https://www.docker.com/blog/feed/', homepage: 'https://www.docker.com/blog/', expectCadenceDays: 14 },
  { id: 'hashicorp', name: 'HashiCorp', topic: 'devops', url: 'https://www.hashicorp.com/blog/feed.xml', homepage: 'https://www.hashicorp.com/blog', expectCadenceDays: 14 },
  { id: 'grafana', name: 'Grafana', topic: 'devops', url: 'https://grafana.com/blog/index.xml', homepage: 'https://grafana.com/blog/', expectCadenceDays: 14 },
  { id: 'datadog', name: 'Datadog', topic: 'devops', url: 'https://www.datadoghq.com/blog/index.xml', homepage: 'https://www.datadoghq.com/blog/', expectCadenceDays: 14 },
  { id: 'honeycomb', name: 'Honeycomb', topic: 'devops', url: 'https://www.honeycomb.io/feed', homepage: 'https://www.honeycomb.io/blog', expectCadenceDays: 21 },
  { id: 'thenewstack', name: 'The New Stack', topic: 'devops', url: 'https://thenewstack.io/feed/', homepage: 'https://thenewstack.io/', expectCadenceDays: 3, cap: 3, notes: '~4 items/day; capped so it cannot dominate the lane.' },
  { id: 'changelog', name: 'Changelog', topic: 'devops', url: 'https://changelog.com/feed', homepage: 'https://changelog.com/', expectCadenceDays: 14 },
  { id: 'gitlab', name: 'GitLab', topic: 'devops', url: 'https://about.gitlab.com/atom.xml', homepage: 'https://about.gitlab.com/blog/', expectCadenceDays: 14 },
  { id: 'gcp-blog', name: 'Google Cloud', topic: 'devops', url: 'https://cloudblog.withgoogle.com/rss/', homepage: 'https://cloud.google.com/blog/', expectCadenceDays: 3, cap: 3 },
  { id: 'azure-updates', name: 'Azure Updates', topic: 'devops', url: 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss', homepage: 'https://azure.microsoft.com/en-us/updates/', expectCadenceDays: 3, cap: 3, notes: '200-item feed of release notes; capped hard.' },
  { id: 'confluent', name: 'Confluent', topic: 'devops', url: 'https://www.confluent.io/feed/', homepage: 'https://www.confluent.io/blog/', expectCadenceDays: 21 },
  { id: 'scylladb', name: 'ScyllaDB', topic: 'devops', url: 'https://www.scylladb.com/feed/', homepage: 'https://www.scylladb.com/blog/', expectCadenceDays: 21 },
  { id: 'redis', name: 'Redis', topic: 'devops', url: 'https://redis.io/blog/feed/', homepage: 'https://redis.io/blog/', expectCadenceDays: 30 },
  { id: 'mongodb', name: 'MongoDB', topic: 'devops', url: 'https://www.mongodb.com/blog/rss', homepage: 'https://www.mongodb.com/blog', expectCadenceDays: 14 },
  { id: 'temporal', name: 'Temporal', topic: 'devops', url: 'https://temporal.io/blog/feed.xml', homepage: 'https://temporal.io/blog', expectCadenceDays: 30 },
  { id: 'planetscale', name: 'PlanetScale', topic: 'devops', url: 'https://planetscale.com/blog/rss.xml', homepage: 'https://planetscale.com/blog', expectCadenceDays: 30 },
  { id: 'vercel', name: 'Vercel', topic: 'devops', url: 'https://vercel.com/atom', homepage: 'https://vercel.com/blog', expectCadenceDays: 14 },
  { id: 'ably', name: 'Ably', topic: 'devops', url: 'https://www.ably.io/blog/rss.xml', homepage: 'https://ably.com/blog', expectCadenceDays: 30, slow: true },
  { id: 'sreweekly', name: 'SRE Weekly', topic: 'devops', url: 'https://sreweekly.com/feed/', homepage: 'https://sreweekly.com/', expectCadenceDays: 10 },
  { id: 'itnext', name: 'ITNEXT', topic: 'devops', url: 'https://itnext.io/feed', homepage: 'https://itnext.io/', expectCadenceDays: 3, cap: 2, notes: 'Medium publication: high volume, variable quality. Capped low; scoring does the rest.' },

  // GitHub release feeds: plain Atom, no auth, no API rate limit. "A new release of a tool
  // I use" is a far better signal than "trending repo". The -alpha/-beta/-rc hard-drop rule
  // in scoring.ts is essential here: 3 of the 4 newest k8s entries were pre-releases.
  ghReleases('kubernetes/kubernetes', 'Kubernetes'),
  ghReleases('hashicorp/terraform', 'Terraform'),
  ghReleases('opentofu/opentofu', 'OpenTofu'),
  ghReleases('prometheus/prometheus', 'Prometheus'),
  ghReleases('grafana/grafana', 'Grafana'),
  ghReleases('cilium/cilium', 'Cilium'),
  ghReleases('envoyproxy/envoy', 'Envoy'),
  ghReleases('etcd-io/etcd', 'etcd'),
  ghReleases('hashicorp/vault', 'Vault'),
  ghReleases('argoproj/argo-cd', 'Argo CD'),
  ghReleases('apache/kafka', 'Kafka'),
  ghReleases('ClickHouse/ClickHouse', 'ClickHouse'),
  ghReleases('duckdb/duckdb', 'DuckDB'),
  ghReleases('temporalio/temporal', 'Temporal'),
  ghReleases('moby/moby', 'Moby/Docker'),
];
