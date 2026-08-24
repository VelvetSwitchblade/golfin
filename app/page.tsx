import type { Metadata } from "next";
import { GolfinPrototype } from "./GolfinPrototype";

export const metadata: Metadata = {
  title: "Golfin",
  description:
    "A browser golf prototype with classic courses, crazy golf, phone controllers, and tabletop play.",
};

export default function Home() {
  return <GolfinPrototype />;
}
