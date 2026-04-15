import { useState, useCallback } from "react";

type PushState = "idle" | "requesting" | "subscribed" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("idle");

  const subscribe = useCallback(async (userId: string, venueId: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    try {
      setState("requesting");

      // Get VAPID public key from server
      const keyRes = await fetch("/api/push/vapid-public-key");
      if (!keyRes.ok) { setState("idle"); return; }
      const { publicKey } = await keyRes.json();

      // Wait for SW to be ready
      const registration = await navigator.serviceWorker.ready;

      // Check existing subscription first
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        // Already subscribed — re-register with server in case it's a new session
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, venueId, subscription: existing.toJSON() }),
        });
        setState("subscribed");
        return;
      }

      // Request permission + subscribe
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState("denied"); return; }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, venueId, subscription: subscription.toJSON() }),
      });

      setState("subscribed");
    } catch (err) {
      console.error("Push subscription failed:", err);
      setState("idle");
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (!sub) return;
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
      setState("idle");
    } catch (err) {
      console.error("Unsubscribe failed:", err);
    }
  }, []);

  return { state, subscribe, unsubscribe };
}
