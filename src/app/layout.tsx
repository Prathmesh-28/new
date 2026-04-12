import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Headroom | Cash Flow Intelligence for SMBs",
  description:
    "Headroom helps SMBs forecast cash 90 days ahead, catch gaps early, access credit in context, and prepare for community or public capital.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
