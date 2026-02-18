import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import PageTransition from "@/components/PageTransition";
import Providers from "@/components/Providers";
import WebGLWrapper from "@/components/webgl/WebGLWrapper";

export const metadata: Metadata = {
  title: {
    template: "Stylend | %s",
    default: "Stylend | Dashboard",
  },
  description: "A cross-chain lending protocol built on Arbitrum Stylus and powered by LayerZero.",
  icons: {
    icon: "/stylend-logo-blue.webp",
    apple: "/stylend-logo-blue.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Fontshare - Panchang (for logo & headings) */}
        <link
          href="https://api.fontshare.com/v2/css?f[]=panchang@300,400,500,600,700&display=swap"
          rel="stylesheet"
        />
        {/* Google Fonts - Inter (for body text) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>
          {/* WebGL Background — particles + arm */}
          <WebGLWrapper />

          <Sidebar />
          <div className="lg:ml-[var(--sidebar-width)] min-h-screen flex flex-col relative z-10">
            <Header />
            <main className="flex-1 p-4 sm:p-6">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
