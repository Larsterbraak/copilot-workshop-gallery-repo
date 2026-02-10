# Security Policy

## Upload Security Model

This application implements comprehensive security controls for file uploads to protect against OWASP Top 10 risks, with particular focus on:

### 1. Server-Side File Upload Validation

**Location:** `src/app/api/uploads/route.ts`

All file uploads are validated server-side with the following controls:

- **File Size Limits**: Maximum 10MB per file (configurable)
- **Magic Byte Validation**: File type is validated using magic bytes via the `file-type` library, not trusting browser-supplied MIME types or file extensions
- **Allowed Types**: Only JPEG, PNG, and WebP images are permitted. SVG is explicitly excluded due to XSS risks
- **Image Normalization**: All images are decoded and re-encoded to WebP format using `sharp`, which:
  - Strips all EXIF and metadata to prevent information disclosure
  - Prevents polyglot file attacks
  - Validates image integrity
  - Ensures consistent output format
- **Dimension Limits**: Maximum 8000x8000 pixels per dimension and 50 megapixels total to prevent decompression bombs
- **Safe Storage**: Uploaded files are stored outside the public directory with randomly generated UUIDs as filenames to prevent path traversal and filename-based attacks

### 2. Input Validation and Sanitization

**Location:** `src/lib/validation/photoMetadata.ts`

User-supplied metadata is validated using Zod schemas:

- **Title Validation**:
  - Length constraints (1-200 characters)
  - Control character removal (U+0000-U+001F, U+007F-U+009F)
  - Unicode normalization (NFC)
  - Whitespace trimming
  
- **Tag Validation**:
  - Array size limits (max 20 tags)
  - Per-tag length limits (1-50 characters)
  - Character allowlist (alphanumeric, hyphens, underscores, spaces only)
  - Lowercase normalization
  - Unicode normalization (NFC)

### 3. Rate Limiting

**Location:** `src/lib/rateLimit.ts`

**⚠️ DEMO IMPLEMENTATION WARNING**: The current rate limiter is an in-memory implementation suitable for development and demonstration purposes only.

**Current Limitations:**
- State is lost on server restart
- Does not work across multiple server instances (not horizontally scalable)
- Memory usage grows with unique IPs/keys
- No distributed coordination

**Rate Limits:**
- Upload endpoint: 10 requests per minute per IP address
- IP detection respects `x-forwarded-for` header (first hop) for proxied requests
- Returns 429 status with `Retry-After` header when limit exceeded

**Production Recommendations:**
- Use Redis-based rate limiting (e.g., [Upstash Rate Limit](https://github.com/upstash/ratelimit))
- Use a Web Application Firewall (e.g., Cloudflare, AWS WAF)
- Use dedicated rate limiting services (e.g., Arcjet, Unkey)
- Implement sliding window or token bucket algorithms
- Add user-based rate limiting in addition to IP-based
- Consider geographic rate limits for suspicious regions

### 4. Secure Image Serving

**Location:** `src/app/api/uploads/[id]/route.ts`

Images are served through a dedicated endpoint with security controls:

- **UUID Validation**: Only valid UUIDs are accepted to prevent path traversal
- **Path Normalization**: Additional path checks prevent directory traversal attacks
- **Security Headers**:
  - `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
  - `Content-Type: image/webp` - Explicit content type
  - `Content-Security-Policy: default-src 'none'` - No script execution
  - `Cache-Control: public, max-age=31536000, immutable` - Efficient caching

### 5. Security Headers (Application-Wide)

**Location:** `next.config.ts`

All routes include baseline security headers:

- **Content-Security-Policy (CSP)**:
  - Default source restricted to self
  - Scripts allow `unsafe-inline` and `unsafe-eval` (required for Next.js development and hydration)
  - Styles allow `unsafe-inline` (required for Next.js and Tailwind CSS)
  - Images allow self, blob, and data URIs (for upload previews)
  - Frame ancestors set to none
  - Form actions restricted to self
  
- **X-Frame-Options**: DENY (prevent clickjacking)
- **X-Content-Type-Options**: nosniff (prevent MIME sniffing)
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: Restricts camera, microphone, and geolocation

**CSP Considerations:**
- `unsafe-inline` for scripts/styles is required for Next.js to function
- For production, consider using nonces or hashes for inline scripts
- `unsafe-eval` is required for Next.js development mode

### 6. Authentication and Authorization

**Location:** `src/app/api/uploads/route.ts`, `src/app/layout.tsx`

**⚠️ DEMO IMPLEMENTATION WARNING**: Current authentication is a placeholder for demonstration only.

**Current Implementation:**
- Simple header-based authentication using `x-demo-auth` header
- Token configured via `DEMO_AUTH_TOKEN` environment variable
- Admin link conditionally shown based on `NEXT_PUBLIC_SHOW_ADMIN` environment variable

**Production Requirements:**
- Implement proper authentication using:
  - [NextAuth.js](https://next-auth.js.org/) for OAuth/JWT
  - [Clerk](https://clerk.com/) for complete auth solution
  - [Auth0](https://auth0.com/) for enterprise auth
  - [Supabase Auth](https://supabase.com/auth) for open-source option
- Implement role-based access control (RBAC)
- Use secure session management
- Implement CSRF protection
- Add audit logging for sensitive operations
- Consider multi-factor authentication (MFA) for admin access

### 7. XSS Prevention

Multiple layers protect against Cross-Site Scripting:

1. **Content Security Policy**: Restricts script execution sources
2. **Image Normalization**: Re-encoding strips any embedded scripts
3. **SVG Exclusion**: SVG files can contain scripts and are blocked
4. **Input Sanitization**: All text inputs are sanitized and normalized
5. **Output Encoding**: React automatically escapes output (JSX)
6. **Security Headers**: `X-Content-Type-Options: nosniff` prevents MIME confusion

## Known Limitations and Future Improvements

### Current Limitations

1. **In-Memory Rate Limiting**: Not suitable for production (see section 3)
2. **Demo Authentication**: Placeholder implementation with client-side token exposure (see section 6)
   - ⚠️ **CRITICAL**: Current demo auth token is exposed in client-side JavaScript bundle
   - Anyone can view the token in browser dev tools or by inspecting the bundle
   - This is ONLY acceptable for demo/workshop purposes
3. **Local File Storage**: Files stored on disk, not cloud storage
4. **No Database**: Metadata not persisted beyond upload response
5. **Single Server**: No distributed coordination or clustering support
6. **CSP Inline Scripts**: Required for Next.js, reduces CSP effectiveness

### Recommended Production Improvements

1. **Cloud Storage Integration**:
   - Use AWS S3, Google Cloud Storage, or Azure Blob Storage
   - Implement signed URLs for temporary access
   - Enable automatic malware scanning
   - Set up lifecycle policies for old uploads

2. **Database Integration**:
   - Store upload metadata in PostgreSQL or similar
   - Track upload history and user associations
   - Enable search and filtering capabilities
   - Implement soft deletes and audit trails

3. **Enhanced Security**:
   - Add malware scanning (ClamAV, VirusTotal API)
   - Implement Content-Disposition headers for downloads
   - Add watermarking for copyright protection
   - Consider image hashing for duplicate detection
   - Add HMAC signing for image URLs
   - Implement session-based upload quotas

4. **Monitoring and Logging**:
   - Add structured logging (Winston, Pino)
   - Implement error tracking (Sentry, Bugsnag)
   - Add security event monitoring
   - Set up alerts for suspicious patterns
   - Track upload success/failure rates

5. **Performance**:
   - Add image CDN (Cloudflare, Fastly)
   - Implement thumbnail generation
   - Add progressive image loading
   - Enable WebP/AVIF format negotiation
   - Add lazy loading for image lists

6. **Compliance**:
   - Add GDPR compliance tools (data export, deletion)
   - Implement privacy policy and terms of service
   - Add content moderation capabilities
   - Consider geographic restrictions
   - Add age verification if applicable

## Reporting Security Vulnerabilities

If you discover a security vulnerability in this application, please report it responsibly:

1. **Do Not** open a public GitHub issue
2. Email security concerns to the repository maintainer
3. Include detailed steps to reproduce the vulnerability
4. Allow reasonable time for fixes before public disclosure

## Security Testing

Before deploying to production:

1. Run dependency audit: `npm audit`
2. Fix high/critical vulnerabilities: `npm audit fix`
3. Run linting: `npm run lint`
4. Run type checking: `npm run build`
5. Test CSP headers in browser console
6. Verify rate limiting with load testing
7. Test file upload validation with malicious files
8. Review security headers using [securityheaders.com](https://securityheaders.com)

## Environment Variables

Required environment variables (see `.env.example`):

- `DEMO_AUTH_TOKEN`: Server-side authentication token (replace with real auth in production)
- `NEXT_PUBLIC_DEMO_AUTH_TOKEN`: Client-side auth token for upload requests
- `NEXT_PUBLIC_SHOW_ADMIN`: Controls admin link visibility

**Important**: Never commit `.env.local` or production secrets to version control.

## License and Disclaimer

This is a workshop/demonstration application. While security best practices are implemented, this code should be thoroughly reviewed and hardened before production use. The maintainers are not responsible for security issues arising from deployment of this code.
