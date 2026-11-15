"use client";

import { useSyncExternalStore } from "react";

import type {
  ColorThemeKey,
  LayoutKey,
  SidePosition,
} from "@/config/appearance";
import type { ColorOverrides } from "@/lib/color-theme";

export interface AppearancePreview {
  layoutKey: LayoutKey;
  sidePosition: SidePosition;
  colorTheme: ColorThemeKey;
  colorOverrides: ColorOverrides;
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
