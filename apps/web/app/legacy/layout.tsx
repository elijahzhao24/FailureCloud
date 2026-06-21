import "@fontsource/barlow-condensed/400.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "../legacy.css";

export default function LegacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
