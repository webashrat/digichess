/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      { source: '/rankings', destination: '/leaderboard', permanent: false },
    ];
  },
};

module.exports = nextConfig;
