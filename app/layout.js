import "./globals.css";
import PlasmaBackground from "@/components/PlasmaBackground";
import { bootScript } from "@/components/Appearance";
export const metadata = { title: "OVA", description: "Call-center CRM: attendance, pipeline, sales, chat and AI", manifest: "/manifest.json", appleWebApp: { capable: true, title: "OVA", statusBarStyle: "black-translucent" }, icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" } };
export const viewport = { themeColor: "#1a1a1b", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" data-appearance="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body><PlasmaBackground />{children}</body>
    </html>
  );
}
