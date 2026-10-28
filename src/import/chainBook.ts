/**
 * ChainBook: every chain the export names, written as reference/chains/ files with the export spellings as aliases.
 * @dev review: src/import/normalizeAddress.ts
 */
import type { AddressFamily } from '../schema';
import { rowSlug } from '../registry';
import { modal } from '../utils/modal';
import { CHAIN_MERGES } from './codeLists';
import type { FileJson, RegistryFiles } from './importTypes';
import { chainOf } from './normalizeAddress';

// A label an editor wrote survives a rerun; one the import derived from an export spelling is derived again.
const handLabel = (known: FileJson, spellings: string[]): string | null =>
  typeof known.label === 'string' && known.label !== known.slug && !spellings.includes(known.label)
    ? known.label
    : null;

export type ChainUse = { slug: string } | { reason: string };

export class ChainBook {
  private readonly chains = new Map<string, { family: AddressFamily; spellings: string[] }>();

  record(slug: string, family: AddressFamily, spelling: string): void {
    const chain = this.chains.get(slug) ?? { family, spellings: [] };
    chain.spellings.push(spelling);
    this.chains.set(slug, chain);
  }

  use(spelling: string): ChainUse {
    const chain = chainOf(spelling, 'chain');
    if (!chain) return { reason: `${spelling} is not a chain` };
    if (!chain.family) return { reason: `chain ${spelling} has no address family the registry can key` };
    this.record(chain.slug, chain.family, chain.spelling);
    return { slug: chain.slug };
  }

  files(existing: Map<string, FileJson>): RegistryFiles {
    const files: RegistryFiles = new Map();
    for (const [slug, { family, spellings }] of [...this.chains].sort(([a], [b]) => a.localeCompare(b))) {
      const known = existing.get(slug) ?? {};
      const merged = Object.keys(CHAIN_MERGES).filter((from) => CHAIN_MERGES[from] === slug);
      const aliases = new Set([
        ...((known.aliases as string[] | undefined) ?? []),
        ...spellings.filter((s) => s !== slug),
        ...merged,
      ]);
      files.set(`reference/chains/${slug}.json`, {
        slug,
        label: handLabel(known, spellings) ?? modal(spellings.filter((spelling) => rowSlug(spelling) === slug)) ?? slug,
        ...(aliases.size ? { aliases: [...aliases].sort() } : {}),
        addressFamily: known.addressFamily ?? family,
        ...Object.fromEntries(
          Object.entries(known).filter(([key]) => !['slug', 'label', 'aliases', 'addressFamily'].includes(key)),
        ),
      });
    }
    return files;
  }
}
