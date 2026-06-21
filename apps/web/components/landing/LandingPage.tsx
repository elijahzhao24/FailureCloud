import LandingNav from "./LandingNav";
import { LandingHero } from "./LandingHero";
import LandingWorkflow from "./LandingWorkflow";
import LandingArtifacts from "./LandingArtifacts";
import LandingExports from "./LandingExports";
import LandingCTA from "./LandingCTA";

export default function LandingPage() {
  return (
    <div className="landing">
      <div className="landing__glow" aria-hidden="true" />
      <div className="landing__grid" aria-hidden="true" />
      <div className="landing__inner">
        <LandingNav />
        <LandingHero />
        <LandingWorkflow />
        <LandingArtifacts />
        <LandingExports />
        <LandingCTA />
      </div>
    </div>
  );
}
