import { execSync } from 'child_process';

// Fetch the git version securely during the build
let gitVersion = 'dev';
try {
  gitVersion = execSync('git describe --tags --always').toString().trim();
} catch (e) {
  console.warn('Could not fetch git version, falling back to "dev" ', e);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Exposes the dynamic version to client components
    NEXT_PUBLIC_APP_VERSION: process.env.APP_VERSION || gitVersion
  },
  poweredByHeader: false,
  // Only static local images are used. Disabling the optimizer removes the /_next/image endpoint,
  // which the session middleware does not cover.
  images: { unoptimized: true }
};

export default nextConfig;
