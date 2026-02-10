import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, normalize } from 'path';

/**
 * Validate UUID to prevent path traversal attacks
 */
function isValidUUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * GET /api/uploads/[id]
 * Serve uploaded images with proper security headers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Validate ID format to prevent path traversal
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid ID', message: 'The provided ID is not valid' },
        { status: 400 }
      );
    }

    // 2. Construct safe file path
    const uploadsDir = join(process.cwd(), 'uploads');
    const filename = `${id}.webp`;
    const filepath = join(uploadsDir, filename);

    // 3. Additional path traversal protection
    const normalizedPath = normalize(filepath);
    if (!normalizedPath.startsWith(uploadsDir)) {
      return NextResponse.json(
        { error: 'Invalid path', message: 'Path traversal detected' },
        { status: 400 }
      );
    }

    // 4. Read file
    const fileBuffer = await readFile(filepath);

    // 5. Return file with security headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (error) {
    // File not found or other error
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Not found', message: 'The requested image was not found' },
        { status: 404 }
      );
    }

    console.error('Error serving image:', error);
    return NextResponse.json(
      { error: 'Server error', message: 'Failed to retrieve image' },
      { status: 500 }
    );
  }
}
