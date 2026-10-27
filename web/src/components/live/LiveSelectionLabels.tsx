"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/**
 * Name tags on the nations other players have selected right now (live map,
 * lib/live/hub.ts): a small yellow pill on the capital — "Ivan", or
 * "Ivan, Max +2" when several are looking at the same nation. Purely
 * visual (never catches clicks). Plain Leaflet markers, one per world copy,
 * rebuilt only when a tag's names change.
 */

export interface LiveSelectionLabel {
  tag: string;
  /** Capital position (map pixel space, y-up). */
  x: number;
  y: number;
  names: string[];
}

const SHOWN_NAMES = 2;

function labelText(names: string[]): string {
  const shown = names.slice(0, SHOWN_NAMES).join(", ");
  return names.length > SHOWN_NAMES ? `${shown} +${names.length - SHOWN_NAMES}` : shown;
}

function labelElement(text: string): HTMLElement {
  const node = document.createElement("div");
  node.textContent = text;
  Object.assign(node.style, {
    position: "absolute",
    left: "0",
    bottom: "14px",
    transform: "translateX(-50%)",
    maxWidth: "180px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    padding: "2px 8px",
    borderRadius: "9999px",
    border: "1px solid rgba(255, 214, 10, 0.75)",
    background: "rgba(15, 23, 42, 0.86)",
    color: "#ffe14d",
    font: "700 11px/16px ui-sans-serif, system-ui, sans-serif",
    boxShadow: "0 0 10px rgba(255, 176, 0, 0.35)",
    pointerEvents: "none",
  });
  return node;
}

export default function LiveSelectionLabels({ labels, worldWidth }: { labels: LiveSelectionLabel[]; worldWidth: number }) {
  const map = useMap();
  const markersRef = useRef(new Map<string, { text: string; markers: L.Marker[] }>());

  useEffect(() => {
    const current = markersRef.current;
    const wanted = new Set<string>();
    for (const label of labels) {
      wanted.add(label.tag);
      const text = labelText(label.names);
      const existing = current.get(label.tag);
      if (existing?.text === text) continue;
      existing?.markers.forEach((marker) => marker.remove());
      const markers = [-worldWidth, 0, worldWidth].map((offset) =>
        L.marker(L.latLng(label.y, label.x + offset), {
          icon: L.divIcon({ html: labelElement(text), className: "", iconSize: [0, 0] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: 2000,
        }).addTo(map),
      );
      current.set(label.tag, { text, markers });
    }
    for (const [tag, { markers }] of current) {
      if (!wanted.has(tag)) {
        markers.forEach((marker) => marker.remove());
        current.delete(tag);
      }
    }
  }, [labels, worldWidth, map]);

  useEffect(() => {
    const current = markersRef.current;
    return () => {
      for (const { markers } of current.values()) markers.forEach((marker) => marker.remove());
      current.clear();
    };
  }, []);

  return null;
}
