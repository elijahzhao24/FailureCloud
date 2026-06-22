import {Composition} from "remotion";
import {
  FailureCloudDeck,
  SLIDE_COUNT,
  SLIDE_FRAMES,
} from "./FailureCloudDeck";
import "./styles.css";

export const RemotionRoot = () => {
  return (
    <Composition
      component={FailureCloudDeck}
      durationInFrames={SLIDE_COUNT * SLIDE_FRAMES}
      fps={30}
      height={1080}
      id="FailureCloudDeck"
      width={1920}
    />
  );
};
