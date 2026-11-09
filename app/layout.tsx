import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "VenueScout", description: "Lead generation for a luxury private event venue in New York." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved Light/Dark choice before paint; Auto follows the system. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("vs_theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
