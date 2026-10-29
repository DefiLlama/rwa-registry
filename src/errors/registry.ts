/**
 * The registry layer's errors, one class per failed check, each naming its file and JSON path.
 * @dev review: src/registry/checks/index.ts
 */
import { RwaError } from './rwaError';

export class RegistryError extends RwaError {
  readonly file: string;
  readonly path: string;

  constructor(at: { file: string; path: string; message: string; cause?: unknown }) {
    super('registry', at.message, { cause: at.cause });
    this.file = at.file;
    this.path = at.path;
  }
}

export class DuplicateKeyError extends RegistryError {}
export class SharedIsinError extends RegistryError {}
export class DanglingReferenceError extends RegistryError {}
export class CycleError extends RegistryError {}
export class AddressFormatError extends RegistryError {}
export class FrozenKeyError extends RegistryError {}
export class UndatedDeploymentError extends RegistryError {}
export class MarketTrackError extends RegistryError {}
export class PlatformFolderError extends RegistryError {}
export class SlugRuleError extends RegistryError {}
export class LabelChangeError extends RegistryError {}
export class UnknownPathError extends RegistryError {}
export class EventTargetError extends RegistryError {}
export class DateOrderError extends RegistryError {}
export class FileNameError extends RegistryError {}
export class VenueAdapterError extends RegistryError {}
export class UndatedEventError extends RegistryError {}
export class MissingReasonError extends RegistryError {}
export class UnderlyingClassError extends RegistryError {}
export class UnverifiedIdentifierError extends RegistryError {}
export class OrganizationKindError extends RegistryError {}
export class PrimaryDeploymentError extends RegistryError {}
export class StaleFlagOverrideError extends RegistryError {}
