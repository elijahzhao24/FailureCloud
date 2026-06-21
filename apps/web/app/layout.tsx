import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./tokens.css";
import "./globals.css";
import "./landing.css";
import "./workspace.css";

export const metadata = {
  title: "FailureCloud — Unit Tests for Robots",
  description:
    "Turn robot tasks into edge-case simulations with sensors, labels, rewards, and exportable test data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
