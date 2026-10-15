/* eslint-disable prettier/prettier */
import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'requiredFeature';

/** Gate a route behind a Basic/Premium feature key — see src/school/feature-keys.ts. */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);
