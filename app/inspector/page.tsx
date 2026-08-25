import type { Metadata } from "next";
import { CourseInspector } from "./CourseInspector";

export const metadata: Metadata = {
  title: "Golfin Course Inspector",
  description: "Compiler output inspector for the Goodwood The Park hole package.",
};

export default function InspectorPage() {
  return <CourseInspector />;
}
