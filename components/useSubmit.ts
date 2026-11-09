"use client";
import { useState } from "react";

export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function post(url: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Something went wrong. Try again.");
        return null;
      }
      return d;
    } catch {
      setError("Can't reach VenueScout. Check your connection.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, post, setError };
}
