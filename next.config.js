// Ensure Next.js/Turbopack uses this folder as the workspace root
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;

