import { useEffect, useRef } from "react";

export const REPORTER_CONTROL_REFRESH_EVENT = "tmos:reporter-control:refresh";
const REPORTER_CONTROL_CHANNEL = "tmos:reporter-control";

export function dispatchReporterControlRefresh(detail = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(REPORTER_CONTROL_REFRESH_EVENT, { detail }));

  if (typeof window.BroadcastChannel === "function") {
    const channel = new BroadcastChannel(REPORTER_CONTROL_CHANNEL);
    channel.postMessage({ type: REPORTER_CONTROL_REFRESH_EVENT, detail });
    channel.close();
  }
}

export function useReporterControlRefresh(callback) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleRefresh = (event) => {
      callbackRef.current?.(event);
    };

    let channel = null;
    const handleChannelMessage = (event) => {
      if (event?.data?.type === REPORTER_CONTROL_REFRESH_EVENT) {
        callbackRef.current?.({ detail: event.data.detail });
      }
    };

    window.addEventListener(REPORTER_CONTROL_REFRESH_EVENT, handleRefresh);

    if (typeof window.BroadcastChannel === "function") {
      channel = new BroadcastChannel(REPORTER_CONTROL_CHANNEL);
      channel.addEventListener("message", handleChannelMessage);
    }

    return () => {
      window.removeEventListener(REPORTER_CONTROL_REFRESH_EVENT, handleRefresh);
      if (channel) {
        channel.removeEventListener("message", handleChannelMessage);
        channel.close();
      }
    };
  }, []);
}