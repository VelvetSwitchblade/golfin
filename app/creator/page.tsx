import type { Metadata } from "next";
import { CourseCreator } from "./CourseCreator";

export const metadata: Metadata = {
  title: "Golfin Course Creator",
  description: "Create playable Golfin course holes with painted semantic surfaces.",
};

export default function CreatorPage() {
  return <CourseCreator />;
}
