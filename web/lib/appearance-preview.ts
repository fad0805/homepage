"use client";

import { useSyncExternalStore } from "react";

import type { LayoutKey, SidePosition } from "@/config/appearance";

export interface AppearancePreview {
  layoutKey: LayoutKey;
  sidePosition: SidePosition;
}

let current: AppearancePreview | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

function getServerSnapshot() {
  return null;
}

export function getAppearancePreview() {
  return current;
}

export function setAppearancePreview(next: AppearancePreview) {
  current = next;
  emit();
}

export function clearAppearancePreview() {
  if (current === null) return;
  current = null;
  emit();
}

export function useAppearancePreview() {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
}
