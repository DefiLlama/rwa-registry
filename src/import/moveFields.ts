/**
 * moveFields: the asset fields that describe one of its nested rows move onto it: the primary chain becomes a flag on that deployment, the protocol ids go to the issuer role, or stay on the asset when it has none; activeMcapReviewed is written as activeAumReviewed, and left out when the sheet's cell is blank.
 * @dev review: src/registry/deriveFields.ts
 */
import { homeOf, platformFile } from '../registry/layout';
import { toFile } from '../schema';
import type { Call, FileJson, RegistryFiles } from './importTypes';

const TOPIC = 'primary chain';

export const moveFields = (staged: RegistryFiles): { files: RegistryFiles; calls: Call[] } => {
  const files: RegistryFiles = new Map(staged);
  const changed: string[] = [];
  const unplaced: string[] = [];
  for (const [path, json] of staged) {
    if (homeOf(path)?.table !== 'asset' || Array.isArray(json)) continue;
    const { primaryChain, issuerProtocolIds, activeMcapReviewed, ...asset } = json;
    const deployments = (asset.deployments as FileJson[] | undefined) ?? [];
    const primary = deployments.findIndex((deployment) => deployment.chain === primaryChain);
    const platform = files.get(platformFile(String(homeOf(path)!.implied))) as FileJson | undefined;
    if (primary === -1 && platform?.primaryChain !== primaryChain) {
      changed.push(`${asset.legacyId} ${primaryChain} to ${platform?.primaryChain ?? 'none'}`);
    }
    const roles = (asset.roles as FileJson[] | undefined) ?? [];
    const issuer = roles.findIndex((role) => role.kind === 'issuer');
    const ids = (issuerProtocolIds as (number | string)[] | undefined) ?? [];
    if (ids.length && issuer === -1) unplaced.push(String(asset.legacyId));
    files.set(path, {
      ...asset,
      ...(ids.length && issuer === -1 ? { protocolIds: ids } : {}),
      ...(activeMcapReviewed == null ? {} : { activeAumReviewed: activeMcapReviewed }),
      ...(asset.deployments
        ? {
            deployments: deployments.map((row, i) =>
              i === primary ? toFile('deployment', { ...row, primary: true }) : row,
            ),
          }
        : {}),
      ...(asset.roles
        ? {
            roles: roles.map((row, i) =>
              i === issuer && ids.length ? toFile('role', { ...row, protocolIds: ids }) : row,
            ),
          }
        : {}),
    });
  }
  const calls: Call[] = [];
  if (changed.length) {
    calls.push({
      topic: TOPIC,
      line: `${changed.length} assets have no deployment on their primary chain, so it falls back to the platform's and the published value changes: ${changed.join('; ')}`,
    });
  }
  if (unplaced.length) {
    calls.push({
      topic: TOPIC,
      line: `protocol ids with no issuer role to hold them, kept on the asset: ${unplaced.join(', ')}`,
    });
  }
  return { files, calls };
};
