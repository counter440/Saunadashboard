/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	experimental: {
		serverActions: { bodySizeLimit: "4mb" },
	},
	transpilePackages: ["@sauna/shared"],
};

export default nextConfig;
