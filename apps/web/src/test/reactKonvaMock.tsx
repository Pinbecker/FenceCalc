import { createElement } from "react";
import type { ReactNode } from "react";

interface KonvaMockProps {
  children?: ReactNode;
  [key: string]: unknown;
}

interface KonvaMockRegistry {
  Arrow: KonvaMockProps[];
  Circle: KonvaMockProps[];
  Group: KonvaMockProps[];
  Layer: KonvaMockProps[];
  Line: KonvaMockProps[];
  Rect: KonvaMockProps[];
  RegularPolygon: KonvaMockProps[];
  Stage: KonvaMockProps[];
  Text: KonvaMockProps[];
}

const registry: KonvaMockRegistry = {
  Arrow: [],
  Circle: [],
  Group: [],
  Layer: [],
  Line: [],
  Rect: [],
  RegularPolygon: [],
  Stage: [],
  Text: []
};

type KonvaMockComponentName = keyof KonvaMockRegistry;

function createMockComponent(name: KonvaMockComponentName) {
  return function MockKonvaComponent(props: KonvaMockProps) {
    registry[name].push(props);
    return createElement(`mock-${name.toLowerCase()}`, null, props.children);
  };
}

export function getKonvaMockRegistry(): KonvaMockRegistry {
  return registry;
}

export function resetKonvaMockRegistry(): void {
  (Object.keys(registry) as KonvaMockComponentName[]).forEach((key) => {
    registry[key] = [];
  });
}

export const Arrow = createMockComponent("Arrow");
export const Circle = createMockComponent("Circle");
export const Group = createMockComponent("Group");
export const Layer = createMockComponent("Layer");
export const Line = createMockComponent("Line");
export const Rect = createMockComponent("Rect");
export const RegularPolygon = createMockComponent("RegularPolygon");
export const Stage = createMockComponent("Stage");
export const Text = createMockComponent("Text");
