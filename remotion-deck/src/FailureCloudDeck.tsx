import type {ReactNode} from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
} from "remotion";

export const SLIDE_FRAMES = 150;
export const SLIDE_COUNT = 6;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const enter = (frame: number, delay = 0) =>
  interpolate(frame, [delay, delay + 22], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

const shift = (frame: number, delay = 0, amount = 28) =>
  interpolate(frame, [delay, delay + 22], [amount, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <i />
        <i />
      </span>
      FailureCloud
    </div>
  );
}

function Slide({
  children,
  dark = false,
  index,
  title,
}: {
  children: ReactNode;
  dark?: boolean;
  index: string;
  title: string;
}) {
  return (
    <AbsoluteFill className={`slide ${dark ? "slide--dark" : ""}`}>
      <div className="slide-grid" />
      <header>
        <Brand />
        <span className="slide-index">{index} / 06</span>
      </header>
      <main>
        <div className="eyebrow">{title}</div>
        {children}
      </main>
      <footer>
        <span>UNIT TESTS FOR ROBOTS</span>
        <span>FAILURECLOUD · PHYSICAL AI</span>
      </footer>
    </AbsoluteFill>
  );
}

function Inspiration() {
  const frame = useCurrentFrame();
  const pulse = spring({
    frame: frame - 34,
    fps: 30,
    config: {damping: 14, stiffness: 80},
  });

  return (
    <Slide dark index="01" title="Inspiration">
      <div className="hero-layout">
        <div>
          <h1
            className="hero-title"
            style={{
              opacity: enter(frame, 4),
              transform: `translateY(${shift(frame, 4, 42)}px)`,
            }}
          >
            Find failures
            <br />
            <span>before robots do.</span>
          </h1>
          <p
            className="hero-copy"
            style={{
              opacity: enter(frame, 18),
              transform: `translateY(${shift(frame, 18)}px)`,
            }}
          >
            Real robots break in the messy edge cases that clean demos and
            common datasets miss.
          </p>
        </div>
        <div
          className="test-stage"
          style={{
            opacity: enter(frame, 15),
            transform: `scale(${0.96 + pulse * 0.04})`,
          }}
        >
          <div className="route-line" />
          <div className="robot-shape">
            <span />
          </div>
          <div className="obstacle-shape" />
          <div className="hazard-zone" />
          <div className="goal-shape" />
          <div className="stage-label stage-label--robot">ROBOT</div>
          <div className="stage-label stage-label--hazard">LOW FRICTION</div>
          <div className="stage-label stage-label--obstacle">OBSTACLE</div>
        </div>
      </div>
    </Slide>
  );
}

const questions = [
  "Will it still work on a slippery floor?",
  "Can it avoid an unseen obstacle?",
  "Can it carry something fragile without spilling?",
  "Can the same failure be reproduced again?",
];

function Problem() {
  const frame = useCurrentFrame();
  const edgeWidth = interpolate(frame, [28, 80], [3, 18], clamp);

  return (
    <Slide index="02" title="The problem">
      <div className="problem-layout">
        <div>
          <h2
            className="slide-title"
            style={{
              opacity: enter(frame, 3),
              transform: `translateY(${shift(frame, 3)}px)`,
            }}
          >
            More data.
            <br />
            <span>Not enough failure data.</span>
          </h2>
          <p className="body-copy" style={{opacity: enter(frame, 14)}}>
            Existing datasets are extensive, but they overrepresent common,
            successful conditions. Rare failures remain expensive to collect,
            label, and reproduce.
          </p>
          <div className="data-bar" style={{opacity: enter(frame, 24)}}>
            <div className="data-bar__common">
              <strong>COMMON CASES</strong>
              <span>Sunny roads · clean floors · nominal behavior</span>
            </div>
            <div className="data-bar__edge" style={{width: `${edgeWidth}%`}}>
              <strong>EDGE CASES</strong>
            </div>
          </div>
        </div>
        <div className="question-stack">
          {questions.map((question, index) => (
            <div
              className="question"
              key={question}
              style={{
                opacity: enter(frame, 18 + index * 8),
                transform: `translateX(${shift(frame, 18 + index * 8, 36)}px)`,
              }}
            >
              <span>0{index + 1}</span>
              <strong>{question}</strong>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

const flow = ["Describe", "Choose", "Edit", "Preview", "Run", "Results", "Export"];

const usableOutputs = [
  "RGB · depth · LiDAR",
  "Labels + metadata",
  "Rewards + criteria",
  "Repeatable configs",
  "Existing tool formats",
];

function SyntheticDataChallenge() {
  const frame = useCurrentFrame();

  return (
    <Slide dark index="03" title="Why synthetic edge-case data is hard">
      <div className="synthetic-heading">
        <h2
          className="slide-title"
          style={{
            opacity: enter(frame, 2),
            transform: `translateY(${shift(frame, 2)}px)`,
          }}
        >
          A cool video
          <br />
          <span>is not enough.</span>
        </h2>
        <p className="body-copy" style={{opacity: enter(frame, 13)}}>
          Robotics teams need failures that are measurable, repeatable, and
          reusable across simulation and ML stacks.
        </p>
      </div>

      <div className="synthetic-layout">
        <div
          className="synthetic-video"
          style={{
            opacity: enter(frame, 15),
            transform: `translateY(${shift(frame, 15, 24)}px)`,
          }}
        >
          <div className="synthetic-video__scene">
            <div className="synthetic-video__robot" />
            <div className="synthetic-video__box" />
            <div className="synthetic-video__play">▶</div>
          </div>
          <div>
            <span>VISUAL OUTPUT</span>
            <strong>Looks convincing</strong>
            <small>But cannot train, evaluate, or reproduce a failure alone.</small>
          </div>
        </div>

        <div className="synthetic-conversion" style={{opacity: enter(frame, 24)}}>
          <span>NEEDS STRUCTURE</span>
          <i>→</i>
        </div>

        <div className="usable-bundle">
          <div>
            <span>ENGINEERING OUTPUT</span>
            <strong>Actually usable</strong>
          </div>
          <ul>
            {usableOutputs.map((output, index) => (
              <li
                key={output}
                style={{
                  opacity: enter(frame, 20 + index * 6),
                  transform: `translateX(${shift(frame, 20 + index * 6, 26)}px)`,
                }}
              >
                <i>0{index + 1}</i>
                {output}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="portability-strip" style={{opacity: enter(frame, 52)}}>
        <span>THE HARDER PROBLEM IS PORTABILITY</span>
        <div>
          {["PyBullet", "ROS", "Isaac Sim", "CARLA", "Nebius", "ML datasets"].map(
            (platform) => (
              <strong key={platform}>{platform}</strong>
            ),
          )}
        </div>
      </div>
    </Slide>
  );
}

function WhatItIs() {
  const frame = useCurrentFrame();

  return (
    <Slide dark index="04" title="What it is">
      <h2
        className="slide-title slide-title--wide"
        style={{
          opacity: enter(frame, 2),
          transform: `translateY(${shift(frame, 2)}px)`,
        }}
      >
        Natural language in.
        <br />
        <span>Executable robot tests out.</span>
      </h2>
      <div className="flow" style={{opacity: enter(frame, 15)}}>
        {flow.map((step, index) => (
          <div
            className="flow-step"
            key={step}
            style={{
              opacity: enter(frame, 14 + index * 5),
              transform: `translateY(${shift(frame, 14 + index * 5, 20)}px)`,
            }}
          >
            <span>0{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
      <div className="scenario-strip">
        <div>
          <span>INPUT</span>
          <p>“A warehouse robot carries a cup of water.”</p>
        </div>
        <div className="scenario-arrow">→</div>
        <div>
          <span>FAILURECLOUD</span>
          <p>Five measurable edge-case scenarios</p>
        </div>
        <div className="scenario-arrow">→</div>
        <div>
          <span>OUTPUT</span>
          <p>Sensors · labels · rewards · verdict</p>
        </div>
      </div>
    </Slide>
  );
}

const architectureNodes = [
  {
    className: "system-node--frontend",
    eyebrow: "Experience",
    title: "Next.js workspace",
    detail: "Describe · edit · preview · inspect",
  },
  {
    className: "system-node--claude",
    eyebrow: "Generation",
    title: "Claude",
    detail: "Edge-case ideas",
  },
  {
    className: "system-node--api",
    eyebrow: "Orchestration",
    title: "FastAPI",
    detail: "Lifecycle · validation · adapters",
  },
  {
    className: "system-node--schema",
    eyebrow: "Canonical contract",
    title: "ScenarioV0_1",
    detail: "Robot · world · sensors · success",
  },
  {
    className: "system-node--preview",
    eyebrow: "Visualization",
    title: "Three.js + Reactor",
    detail: "Schematic + illustrative preview",
  },
  {
    className: "system-node--sim",
    eyebrow: "Execution",
    title: "URDF/USD adaptors",
    detail: "Physics · cameras · ray-cast LiDAR",
  },
  {
    className: "system-node--evaluate",
    eyebrow: "Evidence",
    title: "Recorder + evaluator",
    detail: "Labels · telemetry · verdict",
  },
  {
    className: "system-node--bundle",
    eyebrow: "Portable output",
    title: "Canonical bundle",
    detail: "One source for every exporter",
  },
];

function SystemArchitecture() {
  const frame = useCurrentFrame();

  return (
    <Slide dark index="05" title="System architecture">
      <div className="system-heading">
        <h2
          className="slide-title"
          style={{
            opacity: enter(frame, 2),
            transform: `translateY(${shift(frame, 2)}px)`,
          }}
        >
          Components stay separate.
          <br />
          <span>Data stays connected.</span>
        </h2>
        <p className="body-copy" style={{opacity: enter(frame, 12)}}>
          ScenarioV0_1 is the shared boundary between generation, simulation,
          evidence, and downstream tools.
        </p>
      </div>

      <div className="system-map">
        <svg
          aria-hidden="true"
          className="system-lines"
          viewBox="0 0 1600 470"
        >
          <defs>
            <marker
              id="arrow"
              markerHeight="7"
              markerWidth="7"
              orient="auto-start-reverse"
              refX="6"
              refY="3.5"
            >
              <path d="M0 0 L7 3.5 L0 7 Z" fill="#6ee7b7" />
            </marker>
          </defs>
          {[
            "M250 105 C360 105 365 220 475 220",
            "M250 355 C360 355 365 245 475 245",
            "M680 230 L820 230",
            "M1015 230 C1100 230 1100 105 1190 105",
            "M1015 230 C1100 230 1100 355 1190 355",
            "M1375 355 C1455 355 1435 105 1510 105",
            "M1510 135 L1510 280",
          ].map((path, index) => (
            <path
              d={path}
              fill="none"
              key={path}
              markerEnd="url(#arrow)"
              pathLength="1"
              style={{
                opacity: enter(frame, 24 + index * 4),
                strokeDasharray: 1,
                strokeDashoffset: 1 - enter(frame, 24 + index * 4),
              }}
            />
          ))}
        </svg>

        {architectureNodes.map((node, index) => (
          <div
            className={`system-node ${node.className}`}
            key={node.title}
            style={{
              opacity: enter(frame, 12 + index * 5),
              transform: `translateY(${shift(frame, 12 + index * 5, 18)}px)`,
            }}
          >
            <span>{node.eyebrow}</span>
            <strong>{node.title}</strong>
            <small>{node.detail}</small>
          </div>
        ))}
      </div>
    </Slide>
  );
}

const exportsList = [
  ["PyBullet", "Replay"],
  ["ROS", "Sensor folder"],
  ["OpenPCDet", "Dataset"],
  ["Isaac Sim", "Config"],
  ["Nebius", "Job manifest"],
];

function Exports() {
  const frame = useCurrentFrame();
  const orbit = interpolate(frame, [0, SLIDE_FRAMES], [-2, 2]);

  return (
    <Slide dark index="06" title="Exports & compatibility">
      <div className="exports-layout">
        <div>
          <h2
            className="slide-title"
            style={{
              opacity: enter(frame, 2),
              transform: `translateY(${shift(frame, 2)}px)`,
            }}
          >
            Build the test once.
            <br />
            <span>Take it anywhere.</span>
          </h2>
          <p className="body-copy" style={{opacity: enter(frame, 13)}}>
            Canonical sensor data and evaluation stay independent from
            vendor-specific formats, so new simulator adapters do not require a
            new product.
          </p>
          <div className="future-row" style={{opacity: enter(frame, 25)}}>
            <span>ISAAC SIM</span>
            <span>GAZEBO</span>
            <span>CARLA</span>
            <span>ROS 2</span>
          </div>
        </div>
        <div
          className="export-orbit"
          style={{transform: `rotate(${orbit}deg)`}}
        >
          <div className="bundle-core">
            <span>CANONICAL BUNDLE</span>
            <strong>scenario.json</strong>
            <small>Sensors · labels · evaluation</small>
          </div>
          {exportsList.map(([name, type], index) => (
            <div
              className={`export-node export-node--${index}`}
              key={name}
              style={{
                opacity: enter(frame, 18 + index * 7),
                transform: `scale(${interpolate(
                  enter(frame, 18 + index * 7),
                  [0, 1],
                  [0.86, 1],
                )}) rotate(${-orbit}deg)`,
              }}
            >
              <strong>{name}</strong>
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>
    </Slide>
  );
}

export const FailureCloudDeck = () => {
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={SLIDE_FRAMES}>
        <Inspiration />
      </Sequence>
      <Sequence durationInFrames={SLIDE_FRAMES} from={SLIDE_FRAMES}>
        <Problem />
      </Sequence>
      <Sequence durationInFrames={SLIDE_FRAMES} from={SLIDE_FRAMES * 2}>
        <SyntheticDataChallenge />
      </Sequence>
      <Sequence durationInFrames={SLIDE_FRAMES} from={SLIDE_FRAMES * 3}>
        <WhatItIs />
      </Sequence>
      <Sequence durationInFrames={SLIDE_FRAMES} from={SLIDE_FRAMES * 4}>
        <SystemArchitecture />
      </Sequence>
      <Sequence durationInFrames={SLIDE_FRAMES} from={SLIDE_FRAMES * 5}>
        <Exports />
      </Sequence>
    </AbsoluteFill>
  );
};
