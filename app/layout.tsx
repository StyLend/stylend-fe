import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import PageTransition from "@/components/PageTransition";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Stylend | Cross-Chain Lending & Borrowing",
  description: "Cross-chain isolated pools lending and borrowing protocol",
  icons: {
    icon: "/stylend-logo-blue.webp",
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
          {/* Blue dot radial glow background */}
          <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 translate-y-[30vh] w-[200vw] h-[100vw] opacity-50"
              style={{
                background: "radial-gradient(circle, rgba(1,107,229,0.15) 0%, rgba(1,107,229,0) 70%)",
              }}
            />
          </div>

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
