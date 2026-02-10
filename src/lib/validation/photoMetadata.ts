import { z } from 'zod';

/**
 * Photo metadata validation schema
 * Validates and normalizes user-supplied photo metadata with strict security controls
 */

// Title validation: length bounds, strip control chars, trim, Unicode normalize
const titleSchema = z
  .string()
  .min(1, 'Title must not be empty')
  .max(200, 'Title must not exceed 200 characters')
  .transform((val) => {
    // Remove control characters (U+0000 to U+001F and U+007F to U+009F)
    const sanitized = val.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    // Trim whitespace
    const trimmed = sanitized.trim();
    // Unicode normalize to NFC (Canonical Decomposition, followed by Canonical Composition)
    return trimmed.normalize('NFC');
  })
  .refine((val) => val.length > 0, {
    message: 'Title must not be empty after sanitization',
  });

// Tag validation: array bounds, normalize case, strict character allowlist
const tagSchema = z
  .string()
  .min(1, 'Tag must not be empty')
  .max(50, 'Tag must not exceed 50 characters')
  .regex(
    /^[a-zA-Z0-9\-_\s]+$/,
    'Tag must only contain alphanumeric characters, hyphens, underscores, and spaces'
  )
  .transform((val) => {
    // Normalize to lowercase and trim
    const normalized = val.trim().toLowerCase();
    // Unicode normalize
    return normalized.normalize('NFC');
  });

const tagsArraySchema = z
  .array(tagSchema)
  .max(20, 'Cannot have more than 20 tags')
  .default([]);

// Complete photo metadata schema
export const photoMetadataSchema = z.object({
  title: titleSchema,
  tags: tagsArraySchema,
});

export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;

/**
 * Validates and sanitizes photo metadata
 * @param data - Raw metadata to validate
 * @returns Validated and sanitized metadata
 * @throws ZodError if validation fails
 */
export function validatePhotoMetadata(data: unknown): PhotoMetadata {
  return photoMetadataSchema.parse(data);
}

/**
 * Safe validation that returns result object instead of throwing
 * @param data - Raw metadata to validate
 * @returns Success or error result
 */
export function safeValidatePhotoMetadata(data: unknown) {
  return photoMetadataSchema.safeParse(data);
}
