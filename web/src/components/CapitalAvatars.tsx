"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { playerFromReservation, reservationName, writeDragPlayer } from "@/components/live/hostTypes";
import type { LobbyReservation } from "@/lib/types";

/**
 * Reserved players' round avatars, pinned on their nation's capital
 * (positions from data/mapCapitals.json, built by scripts/build_capitals.py).
 * Co-op players sit as smaller avatars beside the main one.
 *
 *  - click an avatar: open that player's profile card
 *  - Host Tool on: avatars become draggable — drop one on another nation and
 *    the map's existing drop handling moves the player there (same flow as
 *    dragging from the Host Tool panel / roster)
 *
 * Markers are plain Leaflet markers managed imperatively (one per world copy),
 * styled inline so they never depend on stylesheet rebuilds. Each player's
 * marker is only rebuilt when something it shows changes.
 */

export interface CapitalAvatarEntry {
  /** Main reservation slot key. */
  key: string;
  /** Capital position (map pixel space, y-up). */
  x: number;
  y: number;
  main: LobbyReservation;
  coops: LobbyReservation[];
  /** The viewer holds the main slot (green ring). */
  isSelf: boolean;
}

const MAIN_SIZE = 30;
const COOP_SIZE = 18;
/** Avatar scale when fully zoomed out (full size at the closest zoom). */
const MIN_SCALE = 0.55;

/** Shrink avatars as the map zooms out so dense regions stay readable. */
function zoomScale(map: L.Map): number {
  const min = map.getMinZoom();
  const range = Math.max(0.5, map.getMaxZoom() - min);
  const t = Math.min(1, Math.max(0, (map.getZoom() - min) / range));
  return MIN_SCALE + (1 - MIN_SCALE) * t;
}

function applyScale(node: HTMLElement, scale: number): void {
  node.style.transform = `scale(${scale.toFixed(3)})`;
}
const RING = { self: "#62ffa8", other: "#f8fafc", coop: "#3cc4ff" } as const;

/** Stable color per player (FNV-1a, so ids that differ by one digit still
    land on clearly different hues). */
function seedColor(seed: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193) >>> 0;
  }
  return `hsl(${hash % 360}, 55%, 42%)`;
}

function initials(name: string): string {
  return (
    name
      .replace(/^#/, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

interface Handlers {
  draggable: boolean;
  onOpen: (reservation: LobbyReservation, rect: DOMRect) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function avatarButton(reservation: LobbyReservation, size: number, ring: string, handlers: Handlers): HTMLElement {
  const name = reservationName(reservation);
  const button = document.createElement("button");
  button.type = "button";
  button.title = handlers.draggable ? `${name} — drag to another nation` : name;
  button.setAttribute("aria-label", `Open ${name}'s profile`);
  Object.assign(button.style, {
    width: `${size}px`,
    height: `${size}px`,
    padding: "0",
    borderRadius: "9999px",
    overflow: "hidden",
    border: `${size >= MAIN_SIZE ? 2 : 1.5}px solid ${ring}`,
    boxShadow: "0 2px 6px rgba(0,0,0,0.65)",
    background: "#1e293b",
    cursor: handlers.draggable ? "grab" : "pointer",
    pointerEvents: "auto",
    transition: "transform 0.15s ease-out",
    display: "block",
    flexShrink: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  if (reservation.avatar_url) {
    const image = document.createElement("img");
    image.src = reservation.avatar_url;
    image.alt = "";
    image.draggable = false;
    Object.assign(image.style, { width: "100%", height: "100%", objectFit: "cover", display: "block" });
    button.appendChild(image);
  } else {
    Object.assign(button.style, {
      background: seedColor(String(reservation.user_id)),
      color: "#fff",
      fontSize: `${Math.round(size * 0.38)}px`,
      fontWeight: "900",
      lineHeight: `${size - 4}px`,
      textAlign: "center",
    } satisfies Partial<CSSStyleDeclaration>);
    button.textContent = initials(name);
  }

  // Keep the map from panning / selecting the nation underneath.
  L.DomEvent.on(button, "pointerdown mousedown touchstart dblclick contextmenu", L.DomEvent.stopPropagation);
  button.addEventListener("mouseenter", () => {
    button.style.transform = "scale(1.18)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.transform = "";
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onOpen(reservation, button.getBoundingClientRect());
  });
  if (handlers.draggable) {
    button.draggable = true;
    button.addEventListener("dragstart", (event) => {
      event.stopPropagation();
      writeDragPlayer(event, playerFromReservation(reservation));
      handlers.onDragStart();
    });
    button.addEventListener("dragend", () => handlers.onDragEnd());
  }
  return button;
}

function markerElement(entry: CapitalAvatarEntry, handlers: Handlers): HTMLElement {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "relative",
    width: `${MAIN_SIZE}px`,
    height: `${MAIN_SIZE}px`,
    transformOrigin: "50% 50%",
    transition: "transform 0.18s ease-out",
  });
  wrap.appendChild(avatarButton(entry.main, MAIN_SIZE, entry.isSelf ? RING.self : RING.other, handlers));
  if (entry.coops.length > 0) {
    const coops = document.createElement("div");
    Object.assign(coops.style, {
      position: "absolute",
      left: `${MAIN_SIZE - 8}px`,
      top: `${MAIN_SIZE - COOP_SIZE + 4}px`,
      display: "flex",
      gap: "1px",
    });
    for (const coop of entry.coops) coops.appendChild(avatarButton(coop, COOP_SIZE, RING.coop, handlers));
    wrap.appendChild(coops);
  }
  return wrap;
}

/** Everything a marker shows: rebuild only when this changes. */
function signature(entry: CapitalAvatarEntry, draggable: boolean): string {
  const person = (reservation: LobbyReservation) =>
    `${reservation.user_id}|${reservation.avatar_url ?? ""}|${reservationName(reservation)}`;
  return [entry.x, entry.y, entry.isSelf, draggable, person(entry.main), ...entry.coops.map(person)].join("~");
}

export default function CapitalAvatars({
  entries,
  worldWidth,
  draggable,
  onOpen,
}: {
  entries: CapitalAvatarEntry[];
  worldWidth: number;
  /** Host Tool on: avatars can be dragged onto another nation. */
  draggable: boolean;
  onOpen: (reservation: LobbyReservation, rect: DOMRect) => void;
}) {
  const map = useMap();
  const markersRef = useRef(new Map<string, { sig: string; markers: L.Marker[]; nodes: HTMLElement[] }>());
  const scaleRef = useRef(1);

  // Size follows the zoom (live during pinch/wheel zoom, settled at the end).
  useEffect(() => {
    const update = () => {
      const scale = zoomScale(map);
      if (Math.abs(scale - scaleRef.current) < 0.005) return;
      scaleRef.current = scale;
      for (const { nodes } of markersRef.current.values()) nodes.forEach((node) => applyScale(node, scale));
    };
    scaleRef.current = zoomScale(map);
    // zoomlevelschange: the min/max zoom are set once the map knows its size.
    const events = "zoom zoomend zoomlevelschange viewreset";
    map.on(events, update);
    return () => {
      map.off(events, update);
    };
  }, [map]);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    const current = markersRef.current;
    // While a drag is in flight the avatars must not catch the drop: the
    // map's drop handler looks up the nation under the cursor.
    const setCatchPointer = (on: boolean) => {
      for (const { nodes } of current.values()) {
        for (const node of nodes) {
          node.querySelectorAll("button").forEach((button) => {
            button.style.pointerEvents = on ? "auto" : "none";
          });
        }
      }
    };
    const handlers: Handlers = {
      draggable,
      onOpen: (reservation, rect) => onOpenRef.current(reservation, rect),
      // After dragstart returns, so the browser has already captured the drag.
      onDragStart: () => window.setTimeout(() => setCatchPointer(false), 0),
      onDragEnd: () => setCatchPointer(true),
    };

    const wanted = new Set<string>();
    for (const entry of entries) {
      wanted.add(entry.key);
      const sig = signature(entry, draggable);
      const existing = current.get(entry.key);
      if (existing?.sig === sig) continue;
      existing?.markers.forEach((marker) => marker.remove());
      const nodes: HTMLElement[] = [];
      // One marker per world copy (the map repeats left/center/right).
      const markers = [-worldWidth, 0, worldWidth].map((offset) => {
        const node = markerElement(entry, handlers);
        applyScale(node, scaleRef.current);
        nodes.push(node);
        const marker = L.marker(L.latLng(entry.y, entry.x + offset), {
          icon: L.divIcon({
            html: node,
            className: "",
            iconSize: [MAIN_SIZE, MAIN_SIZE],
            iconAnchor: [MAIN_SIZE / 2, MAIN_SIZE / 2],
          }),
          interactive: false,
          keyboard: false,
        });
        // Hovered avatars rise above their neighbors (dense Europe).
        node.addEventListener("mouseenter", () => marker.setZIndexOffset(1000));
        node.addEventListener("mouseleave", () => marker.setZIndexOffset(0));
        return marker.addTo(map);
      });
      current.set(entry.key, { sig, markers, nodes });
    }
    for (const [key, { markers }] of current) {
      if (!wanted.has(key)) {
        markers.forEach((marker) => marker.remove());
        current.delete(key);
      }
    }
  }, [entries, worldWidth, draggable, map]);

  // Remove everything on unmount (scenario / lobby switch).
  useEffect(() => {
    const current = markersRef.current;
    return () => {
      for (const { markers } of current.values()) markers.forEach((marker) => marker.remove());
      current.clear();
    };
  }, []);

  return null;
}
