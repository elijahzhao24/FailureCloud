"use client";

import { Reactor, type ReactorStatus } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

export default function ReactorCinematicSession({
  onError,
  onStop,
  prompt,
}: {
  onError: (message: string) => void;
  onStop: () => void;
  prompt: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reactorRef = useRef<Reactor | null>(null);
  const [status, setStatus] = useState<ReactorStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    const reactor = new Reactor({ modelName: "helios" });
    reactorRef.current = reactor;
    let disposed = false;
    let started = false;

    reactor.on("statusChanged", (nextStatus: ReactorStatus) => {
      if (disposed) return;
      setStatus(nextStatus);
      setSessionId(reactor.getSessionId());
      if (nextStatus === "ready" && !started) {
        started = true;
        void (async () => {
          try {
            await reactor.sendCommand("set_seed", { seed: 42 });
            await reactor.sendCommand("set_prompt", { prompt });
            await reactor.sendCommand("start", {});
          } catch (error) {
            if (!disposed) {
              onError(
                error instanceof Error
                  ? error.message
                  : "Helios rejected the generation command.",
              );
            }
          }
        })();
      }
    });
    reactor.on(
      "trackReceived",
      (name: string, _track: MediaStreamTrack, stream: MediaStream) => {
        if (disposed || name !== "main_video" || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      },
    );
    reactor.on("error", (error: { message?: string }) => {
      if (!disposed) onError(error.message ?? "Reactor connection failed.");
    });

    void fetch(`${API_URL}/v1/integrations/reactor/token`, {
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || "Reactor token exchange failed.");
        }
        return response.json() as Promise<{ jwt: string }>;
      })
      .then(async ({ jwt }) => {
        if (!disposed) await reactor.connect(jwt);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!disposed) {
          onError(
            error instanceof Error ? error.message : "Reactor connection failed.",
          );
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      reactorRef.current = null;
      void reactor.disconnect().catch(() => undefined);
    };
  }, [onError, prompt]);

  return (
    <>
      <video
        autoPlay
        className="fc-reactor-live__video"
        muted
        playsInline
        ref={videoRef}
      />
      {status !== "ready" ? (
        <div className="fc-reactor-live__connecting">
          <i />
          <strong>
            {status === "waiting"
              ? "Waiting for a Helios GPU…"
              : "Connecting to Reactor…"}
          </strong>
          <span>Live world generation starts when the session is ready.</span>
        </div>
      ) : null}
      <div className="fc-reactor-live__status">
        <span className={`fc-reactor-connection is-${status}`}>
          <i />
          {status}
        </span>
        {sessionId ? <code>{sessionId}</code> : null}
        <button
          onClick={() => {
            const reactor = reactorRef.current;
            reactorRef.current = null;
            void reactor?.disconnect().finally(onStop);
          }}
          type="button"
        >
          Stop session
        </button>
      </div>
    </>
  );
}
