/**
 * flagOverrides: today's stablecoin and governance flags kept as data. The server sets them from the sheet row's categories, asset classes and classification; the registry derives them from the rule's categories, the one structure and the classification, so an asset where the two differ gets an override with its reason in its class block, and is listed.
 * @dev review: src/registry/deriveFields.ts
 */
import { flagRule, type FlagRow, type Flags } from '../registry/deriveFields';
import type { Call, FileJson, RegistryFiles } from './importTypes';

const TOPIC = 'flag overrides';
const VOCABULARY = /^reference\/vocabularies\/([^/]+)\.json$/;
const FLAGS = [
  ['stablecoin', 'stablecoinOverride'],
  ['governance', 'governanceOverride'],
] as const;

// Every vocabulary value of the staged files with the vocabulary its file names.
export const vocabularyRows = (files: RegistryFiles): FlagRow[] =>
  [...files].flatMap(([path, json]) => {
    const vocabulary = VOCABULARY.exec(path)?.[1];
    return vocabulary && Array.isArray(json) ? json.map((row) => ({ ...row, vocabulary }) as FlagRow) : [];
  });

// The assets are staged with the sheet's category and asset classes still on them; ruleOf gives the categories their rule shelves them under.
export const flagOverrides = (
  assets: [string, FileJson][],
  ruleOf: (asset: FileJson) => string[],
  vocabulary: FlagRow[],
): { overrides: Map<string, FileJson>; calls: Call[] } => {
  const rule = flagRule(vocabulary);
  const overrides = new Map<string, FileJson>();
  const lines: string[] = [];
  for (const [path, asset] of assets) {
    const classes = asset.assetClass as string[];
    const rwaClassification = String(asset.rwaClassification);
    const category = ruleOf(asset);
    const today: Flags = rule({ category: asset.category as string[], structures: classes, rwaClassification });
    const derived: Flags = rule({ category, structures: classes.slice(0, 1), rwaClassification });
    const differ = FLAGS.filter(([flag]) => today[flag] !== derived[flag]);
    if (!differ.length) continue;
    const said = (flags: Flags) => differ.map(([flag]) => `${flag} ${flags[flag]}`).join(', ');
    const sheet = `${(asset.category as string[]).join(', ') || 'no category'} and ${classes.join(', ')}`;
    const reason = `${said(today)} as the server publishes it from the sheet's ${sheet}; the rule's ${category.join(', ') || 'no category'} on ${classes[0]} derives ${said(derived)}`;
    overrides.set(path, {
      ...Object.fromEntries(differ.map(([flag, field]) => [field, today[flag]])),
      flagReason: reason,
    });
    lines.push(`${asset.legacyId} ${asset.symbol}: ${reason}`);
  }
  const calls = lines.length
    ? [
        {
          topic: TOPIC,
          line: `${overrides.size} assets keep today's flag through an override in their class block; your shelf call decides each, and validate warns once the rule derives the same value.`,
        },
        ...lines.map((line) => ({ topic: TOPIC, line })),
      ]
    : [];
  return { overrides, calls };
};
