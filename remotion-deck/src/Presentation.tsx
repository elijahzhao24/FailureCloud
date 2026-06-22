import {Player, type PlayerRef} from "@remotion/player";
import {useCallback, useEffect, useRef, useState} from "react";
import {
  FailureCloudDeck,
  SLIDE_COUNT,
  SLIDE_FRAMES,
} from "./FailureCloudDeck";

const ANIMATION_MS = 3000;

export function Presentation() {
  const playerRef = useRef<PlayerRef>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slide, setSlide] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const showSlide = useCallback((nextSlide: number) => {
    const bounded = Math.max(0, Math.min(SLIDE_COUNT - 1, nextSlide));
    setSlide(bounded);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    const player = playerRef.current;
    player?.seekTo(bounded * SLIDE_FRAMES);
    player?.play();
    pauseTimer.current = setTimeout(() => player?.pause(), ANIMATION_MS);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void document.documentElement.requestFullscreen();
  }, []);

  useEffect(() => {
    showSlide(0);
    const hideHint = setTimeout(() => setHintVisible(false), 4500);
    return () => {
      clearTimeout(hideHint);
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
    };
  }, [showSlide]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        showSlide(slide + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        showSlide(slide - 1);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFullscreen();
      } else if (event.key === "Home") {
        showSlide(0);
      } else if (event.key === "End") {
        showSlide(SLIDE_COUNT - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSlide, slide, toggleFullscreen]);

  return (
    <main
      aria-label="FailureCloud presentation"
      className="presentation"
      onDoubleClick={toggleFullscreen}
    >
      <div className="presentation__stage">
        <Player
          acknowledgeRemotionLicense
          component={FailureCloudDeck}
          compositionHeight={1080}
          compositionWidth={1920}
          controls={false}
          durationInFrames={SLIDE_COUNT * SLIDE_FRAMES}
          fps={30}
          ref={playerRef}
          style={{height: "100%", width: "100%"}}
        />
      </div>

      <button
        aria-label="Previous slide"
        className="presentation__hit presentation__hit--previous"
        disabled={slide === 0}
        onClick={() => showSlide(slide - 1)}
        type="button"
      />
      <button
        aria-label="Next slide"
        className="presentation__hit presentation__hit--next"
        disabled={slide === SLIDE_COUNT - 1}
        onClick={() => showSlide(slide + 1)}
        type="button"
      />

      <div className={`presentation__hint${hintVisible ? " is-visible" : ""}`}>
        <span>SPACE / →</span> next
        <i />
        <span>←</span> back
        <i />
        <span>F</span> fullscreen
      </div>

      <div className="presentation__progress" aria-hidden="true">
        {Array.from({length: SLIDE_COUNT}, (_, index) => (
          <button
            className={index === slide ? "is-active" : ""}
            key={index}
            onClick={() => showSlide(index)}
            type="button"
          />
        ))}
      </div>
    </main>
  );
}
