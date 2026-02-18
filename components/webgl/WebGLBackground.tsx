"use client";

import { Float, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  Euler,
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  Vector2,
  Vector3,
} from "three";

/* ── Inline shaders ── */

const vertexShader = /* glsl */ `
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

attribute float size;
attribute float speed;
attribute vec3 noise;
attribute float scale;

uniform float uTime;
uniform vec2 uResolution;

void main() {
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);

  modelPosition.x += snoise(vec2(noise.x, uTime * speed)) * scale;
  modelPosition.y += snoise(vec2(noise.y, uTime * speed)) * scale;
  modelPosition.z += snoise(vec2(noise.z, uTime * speed)) * scale;

  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectionPostion = projectionMatrix * viewPosition;

  gl_Position = projectionPostion;
  gl_PointSize = size * 100.;
  gl_PointSize *= (1.0 / - viewPosition.z);
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;

void main() {
  float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
  float strength = 0.05 / distanceToCenter - 0.1;

  gl_FragColor = vec4(uColor, strength);
}
`;

/* ── Route-based arm poses ── */

interface ArmPose {
  position: [number, number, number]; // relative to viewport (x * vw, y * vh)
  scale: number;                      // multiplied by viewport.height
  rotation: [number, number, number]; // in degrees
}

const POSES: Record<string, ArmPose> = {
  // Dashboard — hand reaching up from bottom-right
  dashboard: {
    position: [0.25, -0.8, 0],
    scale: 0.035,
    rotation: [0, 90, 0],
  },
  // Earn — hand tilted, right area
  earn: {
    position: [0.32, -0.55, 0],
    scale: 0.028,
    rotation: [-45, -135, -45],
  },
  // Earn detail — hand shifts left and rotates
  earnDetail: {
    position: [-0.12, -0.7, 0],
    scale: 0.024,
    rotation: [-15, -80, -20],
  },
  // Borrow — hand from bottom-left, different angle
  borrow: {
    position: [-0.2, -0.65, 0],
    scale: 0.03,
    rotation: [0, -14, -16],
  },
  // Borrow detail — hand center-ish, more rotated
  borrowDetail: {
    position: [0.15, -0.68, 0],
    scale: 0.02,
    rotation: [-45, -135, -45],
  },
  // Trade Collateral — hand from lower-right, palm open
  trade: {
    position: [0.3, -0.71, 0],
    scale: 0.032,
    rotation: [0, 200, -16],
  },
  // Faucet — hand from bottom-center, reaching up
  faucet: {
    position: [0.05, -0.68, 0],
    scale: 0.025,
    rotation: [-20, -45, -10],
  },
  // Markets — hand subtle, right side
  markets: {
    position: [0.35, -0.61, 0],
    scale: 0.025,
    rotation: [0, -14, -16],
  },
};

function getPoseForPath(pathname: string): ArmPose {
  if (pathname.startsWith("/earn/")) return POSES.earnDetail;
  if (pathname.startsWith("/earn")) return POSES.earn;
  if (pathname.startsWith("/borrow/")) return POSES.borrowDetail;
  if (pathname.startsWith("/borrow")) return POSES.borrow;
  if (pathname.startsWith("/trade")) return POSES.trade;
  if (pathname.startsWith("/faucet")) return POSES.faucet;
  if (pathname.startsWith("/markets")) return POSES.markets;
  return POSES.dashboard;
}

/* ── Particles (blue dots) ── */

function Particles({
  width = 250,
  height = 250,
  depth = 250,
  count = 100,
  size = 150,
}: {
  width?: number;
  height?: number;
  depth?: number;
  count?: number;
  size?: number;
}) {
  const positions = useMemo(() => {
    const arr = new Array(count * 3);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = MathUtils.randFloatSpread(width);
      arr[i + 1] = MathUtils.randFloatSpread(height);
      arr[i + 2] = MathUtils.randFloatSpread(depth);
    }
    return Float32Array.from(arr);
  }, [count, width, height, depth]);

  const noise = useMemo(
    () =>
      Float32Array.from(
        Array.from({ length: count * 3 }, () => Math.random() * 100)
      ),
    [count]
  );

  const sizes = useMemo(
    () =>
      Float32Array.from(
        Array.from({ length: count }, () => Math.random() * size)
      ),
    [count, size]
  );

  const speeds = useMemo(
    () =>
      Float32Array.from(
        Array.from({ length: count }, () => Math.random() * 0.2)
      ),
    [count]
  );

  const scales = useMemo(
    () =>
      Float32Array.from(
        Array.from({ length: count }, () => Math.random() * 100)
      ),
    [count]
  );

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color("#10E1FF") },
      uResolution: { value: new Vector2(width, height) },
    }),
    [height, width]
  );

  useEffect(() => {
    uniforms.uResolution.value.set(width, height);
  }, [width, height, uniforms]);

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-noise" args={[noise, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-speed" args={[speeds, 1]} />
        <bufferAttribute attach="attributes-scale" args={[scales, 1]} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        uniforms={uniforms}
      />
    </points>
  );
}

/* ── Arm (3D hand, solid blue metallic) — with smooth route-based animation ── */

const armMaterial = new MeshPhysicalMaterial({
  color: new Color("#b0b0b0"),   // Silver/grey — blue directional lights create the blue tint
  metalness: 1,
  roughness: 0.4,
  wireframe: false,              // Solid mesh (not wireframe) — same as landing page
  side: DoubleSide,
});

function Arm({ pathname }: { pathname: string }) {
  const { scene: arm1 } = useGLTF("/models/arm.glb");
  const parentRef = useRef<Group>(null);
  const { viewport } = useThree();

  // Current interpolation targets
  const targetPos = useRef(new Vector3());
  const targetRot = useRef(new Euler());
  const targetScale = useRef(1);

  useEffect(() => {
    arm1.traverse((node: Object3D) => {
      if ((node as Mesh).material) {
        (node as Mesh).material = armMaterial;
      }
    });
  }, [arm1]);

  // Update targets when pathname or viewport changes
  useEffect(() => {
    const pose = getPoseForPath(pathname);
    targetPos.current.set(
      viewport.width * pose.position[0],
      viewport.height * pose.position[1],
      0
    );
    targetRot.current.set(
      MathUtils.degToRad(pose.rotation[0]),
      MathUtils.degToRad(pose.rotation[1]),
      MathUtils.degToRad(pose.rotation[2])
    );
    targetScale.current = viewport.height * pose.scale;
  }, [pathname, viewport]);

  // Set initial position immediately (no lerp on mount)
  const initialized = useRef(false);
  useEffect(() => {
    if (!parentRef.current || initialized.current) return;
    const pose = getPoseForPath(pathname);
    const s = viewport.height * pose.scale;
    parentRef.current.scale.setScalar(s);
    parentRef.current.position.set(
      viewport.width * pose.position[0],
      viewport.height * pose.position[1],
      0
    );
    parentRef.current.rotation.set(
      MathUtils.degToRad(pose.rotation[0]),
      MathUtils.degToRad(pose.rotation[1]),
      MathUtils.degToRad(pose.rotation[2])
    );
    initialized.current = true;
  }, [pathname, viewport]);

  // Smooth lerp every frame
  useFrame(() => {
    if (!parentRef.current || !initialized.current) return;
    const speed = 0.015; // lerp speed — lower = smoother/slower

    // Position
    parentRef.current.position.lerp(targetPos.current, speed);

    // Scale
    const curScale = parentRef.current.scale.x;
    const newScale = MathUtils.lerp(curScale, targetScale.current, speed);
    parentRef.current.scale.setScalar(newScale);

    // Rotation (lerp each axis)
    parentRef.current.rotation.x = MathUtils.lerp(
      parentRef.current.rotation.x,
      targetRot.current.x,
      speed
    );
    parentRef.current.rotation.y = MathUtils.lerp(
      parentRef.current.rotation.y,
      targetRot.current.y,
      speed
    );
    parentRef.current.rotation.z = MathUtils.lerp(
      parentRef.current.rotation.z,
      targetRot.current.z,
      speed
    );
  });

  return (
    <Float floatIntensity={0.15} rotationIntensity={0.08} speed={1.5}>
      <group ref={parentRef}>
        <primitive object={arm1} scale={[1, 1, 1]} />
      </group>
    </Float>
  );
}

/* ── Scene content ── */

function Content({ pathname }: { pathname: string }) {
  const { scene, viewport } = useThree();

  useEffect(() => {
    scene.background = new Color("#000000");
  }, [scene]);

  return (
    <>
      {/* Ambient — dark blue base (matching landing page step 0) */}
      <ambientLight args={[new Color("#05163D")]} />

      {/* Key light — blue, from upper-left */}
      <group position={[-200, 150, 50]}>
        <directionalLight args={[new Color("#016BE5"), 0.35]} />
      </group>

      {/* Fill light — blue, from right-below */}
      <group position={[300, -100, 150]}>
        <directionalLight args={[new Color("#016BE5"), 0.15]} />
      </group>

      <Particles
        width={viewport.width}
        height={viewport.height}
        depth={500}
        count={100}
        size={150}
      />
      <Arm pathname={pathname} />
    </>
  );
}

/* ── Exported component ── */

export default function WebGLBackground({ pathname }: { pathname: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <Canvas
        gl={{
          powerPreference: "high-performance",
          antialias: true,
          alpha: true,
        }}
        dpr={[1, 2]}
        orthographic
        camera={{ near: 0.01, far: 10000, position: [0, 0, 1000] }}
      >
        <Suspense fallback={null}>
          <Content pathname={pathname} />
        </Suspense>
      </Canvas>
      {/* Blue radial glow at bottom — matching landing page .canvas::after */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          height: "100vw",
          width: "200vw",
          background: "radial-gradient(rgb(1, 107, 229), rgba(1, 107, 229, 0) 70%)",
          transform: "translateX(-50%) translateY(50vh)",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
