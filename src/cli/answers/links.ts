/**
 * link answers: a web link as the schema's url type reads it, and a link on the hosts of one site, as a Twitter link on x.com.
 * @dev review: src/schema/primitives.ts
 */
import { url } from '../../schema/primitives';
import { accepted, refused, type AnswerType } from './answerType';

export const link: AnswerType = {
  shape: 'a link starting with https://',
  read: (typed) =>
    url.safeParse(typed).success
      ? accepted(typed)
      : refused('not a link; a link starts with https://, as https://xstocks.fi'),
};

// A subdomain counts as its site, as de.linkedin.com for linkedin.com.
export const linkOn = (...hosts: string[]): AnswerType => ({
  shape: `a link on ${hosts.join(' or ')}`,
  read: (typed, context) => {
    const read = link.read(typed, context);
    if ('refused' in read) return read;
    const host = new URL(typed).hostname.toLowerCase();
    return hosts.some((site) => host === site || host.endsWith(`.${site}`))
      ? read
      : refused(`not a link on ${hosts.join(' or ')}, as https://${hosts[0]}/...`);
  },
});
