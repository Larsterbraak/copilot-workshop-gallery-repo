import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { validatePhotoMetadata } from '@/lib/validation/photoMetadata';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';
import { randomUUID } from 'crypto';

/**
 * Security configuration for uploads
 */
const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_DIMENSION: 8000, // Max width or height in pixels
  MAX_PIXELS: 50_000_000, // ~50 megapixels (e.g., 7071x7071) to prevent decompression bombs
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  OUTPUT_FORMAT: 'webp' as const,
  OUTPUT_QUALITY: 90,
};

/**
 * Basic authentication check (placeholder for demo)
 * In production, use proper authentication (NextAuth.js, Clerk, Auth0, etc.)
 */
function checkAuth(request: NextRequest): boolean {
  // Demo auth: check for a simple header or environment variable
  // In production, replace with proper session/JWT validation
  const authHeader = request.headers.get('x-demo-auth');
  const validToken = process.env.DEMO_AUTH_TOKEN || 'demo-token-123';
  
  return authHeader === validToken;
}

/**
 * Validate file type using magic bytes (not trusting extensions or browser MIME types)
 */
async function validateFileType(buffer: Buffer): Promise<string> {
  const fileType = await fileTypeFromBuffer(buffer);
  
  if (!fileType) {
    throw new Error('Unable to determine file type');
  }

  const allowedTypes: readonly string[] = UPLOAD_CONFIG.ALLOWED_MIME_TYPES;
  if (!allowedTypes.includes(fileType.mime)) {
    throw new Error(
      `Invalid file type: ${fileType.mime}. Only JPEG, PNG, and WebP images are allowed.`
    );
  }

  return fileType.mime;
}

/**
 * Normalize and validate image using sharp
 * This strips metadata, prevents polyglot payloads, and enforces dimension limits
 */
async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // Validate dimensions
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  if (
    metadata.width > UPLOAD_CONFIG.MAX_DIMENSION ||
    metadata.height > UPLOAD_CONFIG.MAX_DIMENSION
  ) {
    throw new Error(
      `Image dimensions exceed maximum allowed (${UPLOAD_CONFIG.MAX_DIMENSION}x${UPLOAD_CONFIG.MAX_DIMENSION})`
    );
  }

  const totalPixels = metadata.width * metadata.height;
  if (totalPixels > UPLOAD_CONFIG.MAX_PIXELS) {
    throw new Error(
      `Image pixel count (${totalPixels}) exceeds maximum allowed (${UPLOAD_CONFIG.MAX_PIXELS})`
    );
  }

  // Re-encode to safe format, stripping all metadata
  const normalized = await image
    .webp({ quality: UPLOAD_CONFIG.OUTPUT_QUALITY })
    .toBuffer();

  return normalized;
}

/**
 * POST /api/uploads
 * Secure file upload endpoint with comprehensive validation
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication check
    if (!checkAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required for uploads' },
        { status: 401 }
      );
    }

    // 2. Rate limiting
    const clientIp = getClientIp(request.headers);
    const rateLimitResponse = checkRateLimit(clientIp);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // 3. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', message: 'Please provide a file to upload' },
        { status: 400 }
      );
    }

    // 4. File size validation
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: 'File too large',
          message: `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed (${UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB)`,
        },
        { status: 400 }
      );
    }

    // 5. Read file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 6. Validate file type by magic bytes
    const detectedMimeType = await validateFileType(buffer);

    // 7. Normalize image (strips metadata, re-encodes, validates dimensions)
    const normalizedBuffer = await normalizeImage(buffer);

    // 8. Validate and sanitize metadata
    const title = formData.get('title') as string | null;
    const tagsRaw = formData.get('tags') as string | null;
    
    let tags: string[] = [];
    if (tagsRaw) {
      try {
        tags = JSON.parse(tagsRaw);
      } catch {
        // If not JSON, treat as comma-separated string
        tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    const metadata = validatePhotoMetadata({
      title: title || 'Untitled',
      tags,
    });

    // 9. Generate secure random filename
    const fileId = randomUUID();
    const filename = `${fileId}.webp`;

    // 10. Store file safely (not in public directory)
    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, normalizedBuffer);

    // 11. Return success response with retrieval URL
    return NextResponse.json(
      {
        success: true,
        id: fileId,
        url: `/api/uploads/${fileId}`,
        metadata: {
          title: metadata.title,
          tags: metadata.tags,
          originalMimeType: detectedMimeType,
          size: normalizedBuffer.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Upload error:', error);

    // Return appropriate error response
    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Upload failed', message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Upload failed', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
