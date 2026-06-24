import type { Metadata } from "next";
import { Saira_Condensed, Archivo } from "next/font/google";
import "./globals.css";

// Display face — bold condensed, uppercase impact for headlines & big numbers.
const sairaCondensed = Saira_Condensed({
  weight: ["600", "700"],
  variable: "--font-saira-condensed",
  subsets: ["latin"],
});

// Body / UI — clean grotesque sans.
const archivo = Archivo({
  weight: ["400", "500", "700"],
  variable: "--font-archivo",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "COLT — Rise through the ranks",
  description:
    "Rise through the ranks. Climb the ladder, earn your badges, and keep your Heat alive — training and rewards that make every session count.",
  icons: {
    icon: ["/brand/favicon.svg", "/brand/favicon-32.png"],
    apple: "/brand/apple-touch-icon-180.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "COLT — Rise through the ranks",
    description: "Training and rewards that make every session count.",
    images: ["/brand/og-image.png"],
  },
};

export const viewport = {
  themeColor: "#0B0B0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sairaCondensed.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
