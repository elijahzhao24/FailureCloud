import Link from "next/link";
import LandingBrand from "./LandingBrand";

const navLinks = [
  { href: "#workflow", label: "Workflow" },
  { href: "#artifacts", label: "Artifacts" },
  { href: "#exports", label: "Exports" },
] as const;

export default function LandingNav() {
  return (
    <nav className="landing-nav">
      <LandingBrand />
      <ul className="landing-nav__links">
        {navLinks.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
      <Link className="landing-nav__cta" href="/app">
        Launch app
        <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}
