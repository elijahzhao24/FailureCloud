"use client";

import {
  ReactorProvider,
  ReactorView,
  useReactor,
} from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

function AutoStart({ prompt }: { prompt: string }) {
  const started = useRef(false);
  const { status, sendCommand } = useReactor((state) => ({
    status: state.status,
    sendCommand: state.sendCommand,
  }));

  useEffect(() => {
    if (status !== "ready" || started.current) return;
    started.current = true;
    void (async () => {
      await sendCommand("set_prompt", { prompt });
      await sendCommand("start", {});
    })();
  }, [prompt, sendCommand, status]);

  return (
    <div className="reactor-session-state">
      <i className={status === "ready" ? "ready" : ""} />
      {status.toUpperCase()}
    </div>
  );
}

export default function ReactorLivePreview({
  prompt,
  posterUrl,
}: {
  prompt: string;
  posterUrl: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${API_URL}/v1/integrations/reactor/token`, {
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Reactor token exchange failed");
        return response.json() as Promise<{ jwt: string }>;
      })
      .then((payload) => setToken(payload.jwt))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Reactor connection failed");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return (
      <div className="reactor-fallback">
        <img src={posterUrl} alt="Fallback cinematic warehouse preview" />
        <span>{error} · showing cached fallback</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="generation-scan">
        <i />
        <span>MINTING REACTOR SESSION TOKEN…</span>
      </div>
    );
  }

  return (
    <ReactorProvider
      modelName="helios"
      jwtToken={token}
      apiUrl={process.env.NEXT_PUBLIC_REACTOR_API_URL ?? "https://api.reactor.inc"}
      connectOptions={{ autoConnect: true }}
    >
      <ReactorView
        track="main_video"
        muted
        className="reactor-video"
        videoObjectFit="cover"
      />
      <AutoStart prompt={prompt} />
    </ReactorProvider>
  );
}
