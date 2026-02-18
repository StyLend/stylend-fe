"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const WebGLBackground = dynamic(() => import("./WebGLBackground"), {
  ssr: false,
});

export default function WebGLWrapper() {
  const pathname = usePathname();
  return <WebGLBackground pathname={pathname} />;
}
