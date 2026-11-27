import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "material-symbols/outlined.css";
import "./globals.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import "@/lib/network/initOutboundProxy"; // Auto-initialize outbound proxy env
import "@/shared/services/bootstrap"; // Auto-run initializeApp (watchdog, auto-resume tunnel)
import { initConsoleLogCapture } from "@/lib/consoleLogBuffer";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";
import { AgentationToolbar } from "@/shared/components/AgentationToolbar";

// Hook console immediately at module load time (server-side only, runs once)
initConsoleLogCapture();

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "9Router - AI Infrastructure Management",
  description: "One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050811" },
    { media: "(prefers-color-scheme: light)", color: "#F2F6FC" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="fonts-loaded" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        {/* Apply persisted theme before first paint so a reload does not flash the
            default (light) theme before the client store hydrates. Mirrors the
            zustand-persist "theme" key and the `dark` class applyTheme() sets. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('theme');var t=s?(JSON.parse(s).state||{}).theme:'system';t=t||'system';var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t==='system'&&m)){document.documentElement.classList.add('dark','fonts-loaded')}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <RuntimeI18nProvider>
            {children}
            <AgentationToolbar />
          </RuntimeI18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
