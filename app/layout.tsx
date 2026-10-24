import type { Metadata } from "next";
import { Inter, Geist_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Shell } from "@/components/shell";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "LabelPay",
  description: "Label what models can't. An agent monitors the work. Get paid in SOL per label.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} ${pixel.variable} dark h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
