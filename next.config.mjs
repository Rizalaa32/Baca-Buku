import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    // Jangan cache stream binary buku di Service Worker Workbox;
    // file buku dikelola secara eksplisit melalui IndexedDB agar kuota terkontrol.
    runtimeCaching: [
      {
        urlPattern: /^\/api\/drive\/stream\/.*/i,
        handler: "NetworkOnly",
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "drive.google.com",
      },
    ],
  },
  webpack: (config) => {
    // Wajib untuk pdfjs-dist / react-pdf agar tidak mencari modul native 'canvas' Node.js
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default withPWA(nextConfig);

