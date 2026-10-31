/**
 * fees: the revenue and fee terms of one platform organization.
 * @dev review: src/schema/organization.ts
 */
import { z } from 'zod';
import type { VocabularyTypes } from './defineTable';
import { date, flag, number, optional, text, url } from './primitives';

export const fees = (v: VocabularyTypes) =>
  z.strictObject({
    revenueModel: optional(text),
    holderTotalFeeBps: optional(number),
    assetManagerTakeBps: optional(number),
    tokenizationPlatformTakeBps: optional(number),
    performanceFeePct: optional(number),
    yieldSpreadRetainedBps: optional(number),
    mintFeeBps: optional(number),
    redemptionFeeBps: optional(number),
    underlyingFundExpenseBps: optional(number),
    floatIncome: optional(flag),
    platformSetupFeeUsd: optional(number),
    platformRecurringServiceFeeUsdPerYr: optional(number),
    prospectusUrl: optional(url),
    feeScheduleUrl: optional(url),
    issuerDocsUrl: optional(url),
    tcsUrl: optional(url),
    governanceWhitepaperUrl: optional(url),
    revenueConfidence: optional(v['revenue-confidence']),
    feeLastVerified: optional(date),
    feeWaiverEndDate: optional(date),
    revenueNotes: optional(text),
    revenueVerificationMethod: optional(text),
    chainShareClassFeeVariants: optional(text),
    subsidyRebateArrangements: optional(text),
    takeRateBasis: optional(text),
    revenueMix: optional(text),
  });
