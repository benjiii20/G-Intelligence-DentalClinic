import { monthOf } from '../data/dates';
import type { Dataset, PostType, SourceKey } from '../data/types';
import { POST_TYPES } from '../data/types';
import { firstMissing, indexOf, missingSource, ok, pct, sum, type Filter, type MetricResult } from './core';
import { newPatientValue6m } from './marketing';
import { requestsIn } from './requests';
import { newPatientIds } from './revenue';

const SRC: SourceKey[] = ['instagram', 'pvs'];

export interface PostTypeRow {
  type: PostType;
  posts: number;
  avgReach: number | null;
  linkClicks: number;
  requests: number;
  newPatients: number;
}

export interface InstagramFunnel {
  posts: number;
  reach: number;
  profileVisits: number;
  linkClicks: number;
  messages: number;
  requests: number;
  newPatients: number;
  conversionPct: number | null;
  /** new patients × typical 6-month value of Instagram patients (history); an estimate */
  value6m: number | null;
  byPostType: PostTypeRow[];
}

/** Instagram funnel: posts → reach → profile visits → link clicks → messages → requests → new patients. */
export function instagramFunnel(data: Dataset, f: Filter): MetricResult<InstagramFunnel> {
  const miss = firstMissing(data, SRC);
  if (miss) return missingSource('count', SRC, miss);
  const ix = indexOf(data);
  const posts = data.igPosts.filter((p) => p.date >= f.from && p.date <= f.to);
  const postType = new Map(data.igPosts.map((p) => [p.id, p.type]));
  const reqs = requestsIn(data, { from: f.from, to: f.to }).filter((r) => r.channel === 'instagram_dm' || r.channel === 'instagram_bio');
  const newIg = newPatientIds(data, { from: f.from, to: f.to }).filter((id) => ix.patient.get(id)?.channel === 'instagram').length;
  const messages = sum(data.igMonthly.filter((m) => m.month >= monthOf(f.from) && m.month <= monthOf(f.to)).map((m) => m.messages));
  const value = newPatientValue6m(data, { channel: 'instagram' }).value;
  const byPostType = POST_TYPES.map((type): PostTypeRow => {
    const ps = posts.filter((p) => p.type === type);
    const rs = reqs.filter((r) => r.igPostId && postType.get(r.igPostId) === type);
    return {
      type,
      posts: ps.length,
      avgReach: ps.length ? sum(ps.map((p) => p.reach)) / ps.length : null,
      linkClicks: sum(ps.map((p) => p.linkClicks)),
      requests: rs.length,
      newPatients: rs.filter((r) => r.becamePatientId).length,
    };
  }).sort((a, b) => b.newPatients - a.newPatients || b.requests - a.requests);
  return ok(
    {
      posts: posts.length,
      reach: sum(posts.map((p) => p.reach)),
      profileVisits: sum(posts.map((p) => p.profileVisits)),
      linkClicks: sum(posts.map((p) => p.linkClicks)),
      messages,
      requests: reqs.length,
      newPatients: newIg,
      conversionPct: reqs.length ? pct(newIg, reqs.length) : null,
      value6m: value !== null ? newIg * value : null,
      byPostType,
    },
    'count',
    posts.length,
    SRC,
  );
}
