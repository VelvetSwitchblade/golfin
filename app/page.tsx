import type { Metadata } from "next";
import { GolfinPrototype } from "./GolfinPrototype";

export const metadata: Metadata = {
  title: "Golfin",
  description:
    "A fullscreen golf physics prototype for testing ball flight, bounce, and roll.",
};

export default function Home() {
  return <GolfinPrototype />;
}
