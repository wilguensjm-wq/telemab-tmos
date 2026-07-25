import { useEffect, useRef } from "react";

export const BROADCAST_STATUS_REFRESH_EVENT = "tmos:broadcast-status:refresh";
const BROADCAST_STATUS_CHANNEL = "tmos:broadcast-status";

export function dispatchBroadcastStatusRefresh(detail = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(BROADCAST_STATUS_REFRESH_EVENT, { detail }));

  if (typeof window.BroadcastChannel === "function") {
    const channel = new BroadcastChannel(BROADCAST_STATUS_CHANNEL);
    channel.postMessage({ type: BROADCAST_STATUS_REFRESH_EVENT, detail });
    channel.close();
  }
}

export function useBroadcastStatusRefresh(callback) {
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
      if (event?.data?.type === BROADCAST_STATUS_REFRESH_EVENT) {
        callbackRef.current?.({ detail: event.data.detail });
      }
    };

    window.addEventListener(BROADCAST_STATUS_REFRESH_EVENT, handleRefresh);

    if (typeof window.BroadcastChannel === "function") {
      channel = new BroadcastChannel(BROADCAST_STATUS_CHANNEL);
      channel.addEventListener("message", handleChannelMessage);
    }

    return () => {
      window.removeEventListener(BROADCAST_STATUS_REFRESH_EVENT, handleRefresh);
      if (channel) {
        channel.removeEventListener("message", handleChannelMessage);
        channel.close();
      }
    };
  }, []);
}