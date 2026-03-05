import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias['playground'] = path.resolve(__dirname, 'src');
    return config;
  },
};

export default nextConfig;
