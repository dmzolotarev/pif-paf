import type { Metadata, Viewport } from "next";
import { getSettings } from "@/lib/settings-store";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3eedf",
};

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSettings();
  const title = config.title;
  const description = config.tagline;

  return {
    title,
    description,
    applicationName: title,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      title,
      description,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
