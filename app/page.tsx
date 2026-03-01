"use client";

import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const orbSize = 460;
const LENS_RADIUS = 90; // px
const THREE_CDN_URL = "https://unpkg.com/three@0.180.0/build/three.module.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ThreeModule = any;

type Hotspot = {
  id: string;
  label: string;
  angle: number;
  tilt: number;
  content?: string;
};

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

const floatingDots = [
  { left: "8%", top: "16%", size: 5, delay: 0, duration: 9, dx: 14, dy: -10 },
  { left: "18%", top: "72%", size: 4, delay: 1.2, duration: 11, dx: -12, dy: -14 },
  { left: "31%", top: "28%", size: 3, delay: 0.8, duration: 10, dx: 16, dy: 8 },
  { left: "42%", top: "82%", size: 4, delay: 2.1, duration: 12, dx: -10, dy: -12 },
  { left: "56%", top: "18%", size: 5, delay: 1.7, duration: 9.5, dx: 10, dy: 12 },
  { left: "66%", top: "68%", size: 3, delay: 0.3, duration: 10.8, dx: -16, dy: 6 },
  { left: "78%", top: "34%", size: 4, delay: 1.5, duration: 11.5, dx: 12, dy: -8 },
  { left: "88%", top: "77%", size: 5, delay: 0.9, duration: 10.2, dx: -10, dy: -10 },
];

declare global {
  interface Window {
    __threeModulePromise?: Promise<ThreeModule>;
  }
}

async function loadThreeModule(): Promise<ThreeModule> {
  if (typeof window === "undefined") {
    throw new Error("three.js can only be loaded in browser");
  }
  if (!window.__threeModulePromise) {
    window.__threeModulePromise = import(
      /* webpackIgnore: true */ THREE_CDN_URL
    ) as Promise<ThreeModule>;
  }
  return window.__threeModulePromise;
}

function createSpherePoints(count: number): Vec3[] {
  if (count === 1) return [{ x: 0, y: 0, z: 1 }];
  const points: Vec3[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const y = 1 - t * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push({
      x: Math.cos(theta) * ring,
      y,
      z: Math.sin(theta) * ring,
    });
  }
  return points;
}

function rotatePoint(point: Vec3, xRot: number, yRot: number): Vec3 {
  const cosX = Math.cos(xRot);
  const sinX = Math.sin(xRot);
  const cosY = Math.cos(yRot);
  const sinY = Math.sin(yRot);

  const y1 = point.y * cosX - point.z * sinX;
  const z1 = point.y * sinX + point.z * cosX;
  const x1 = point.x;

  return {
    x: x1 * cosY + z1 * sinY,
    y: y1,
    z: -x1 * sinY + z1 * cosY,
  };
}

export default function Home() {
  const [active, setActive] = useState<Hotspot | null>(null);
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRotation = useRef({ x: 0, y: 0 });
  const [threeReady, setThreeReady] = useState(false);
  const hotspotNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Lens state
  const [lensPos, setLensPos] = useState({ x: -9999, y: -9999 });
  const [lensActive, setLensActive] = useState(false);

  // Refs for the two text zones
  const leftTextRef = useRef<HTMLDivElement>(null);
  const rightTextRef = useRef<HTMLDivElement>(null);

  const hotspots = useMemo<Hotspot[]>(
    () => [
      {
        id: "about",
        label: "about me",
        angle: 10,
        tilt: -10,
        content:
          "sruthi vangavolu is an 18-year-old freshman at georgia tech studying computer science. she loves art, dance, time outside, and travel, and is drawn to how technology and design shape human-computer interaction.",
      },
      { id: "gallery", label: "art gallery", angle: 130, tilt: -8 },
      { id: "dance-gallery", label: "dance gallery", angle: 160, tilt: -6 },
      { id: "projects", label: "projects", angle: 190, tilt: 14 },
      { id: "contact", label: "contact", angle: 250, tilt: 22 },
      { id: "updates", label: "updates", angle: 310, tilt: 24 },
    ],
    []
  );

  const hotspotVectors = useMemo(
    () =>
      createSpherePoints(hotspots.length).map((point, index) => ({
        ...point,
        id: hotspots[index].id,
      })),
    [hotspots]
  );

  useEffect(() => {
    targetRotation.current = { x: rotX, y: rotY };
  }, [rotX, rotY]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [hotspotVectors]);

  useEffect(() => {
    const canvas = orbCanvasRef.current;
    if (!canvas) return;

    let isDisposed = false;
    let cleanup = () => {};

    const mountThreeOrb = async () => {
      const THREE = await loadThreeModule();
      if (isDisposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(orbSize, orbSize, false);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.z = 4.2;

      const orbGroup = new THREE.Group();
      scene.add(orbGroup);

      const geometry = new THREE.IcosahedronGeometry(1.55, 18);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const wobble =
          1 +
          0.035 * Math.sin(x * 6.8 + y * 1.8) +
          0.024 * Math.sin(y * 8.4 + z * 1.2) +
          0.02 * Math.cos(z * 8.9 + x * 1.4);
        positions.setXYZ(i, x * wobble, y * wobble, z * wobble);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();

      const paperCanvas = document.createElement("canvas");
      paperCanvas.width = 256;
      paperCanvas.height = 256;
      const paperCtx = paperCanvas.getContext("2d");
      if (paperCtx) {
        paperCtx.fillStyle = "#fbe6ef";
        paperCtx.fillRect(0, 0, paperCanvas.width, paperCanvas.height);
        const imageData = paperCtx.getImageData(
          0,
          0,
          paperCanvas.width,
          paperCanvas.height
        );
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const grain = 235 + Math.floor(Math.random() * 20);
          data[i] = grain;
          data[i + 1] = grain - 4;
          data[i + 2] = grain - 2;
          data[i + 3] = 255;
        }
        paperCtx.putImageData(imageData, 0, 0);
      }

      const paperTexture = new THREE.CanvasTexture(paperCanvas);
      paperTexture.wrapS = THREE.RepeatWrapping;
      paperTexture.wrapT = THREE.RepeatWrapping;
      paperTexture.repeat.set(2, 2);

      const material = new THREE.MeshPhysicalMaterial({
        color: "#fbe6ef",
        map: paperTexture,
        roughness: 0.78,
        metalness: 0.01,
        transmission: 0.18,
        thickness: 0.9,
        clearcoat: 0.05,
        clearcoatRoughness: 0.6,
        sheen: 0.2,
        sheenRoughness: 0.75,
        bumpMap: paperTexture,
        bumpScale: 0.015,
      });
      const orb = new THREE.Mesh(geometry, material);
      orbGroup.add(orb);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1.25, 64, 64),
        new THREE.MeshBasicMaterial({
          color: "#18060c",
          transparent: true,
          opacity: 0.25,
        })
      );
      orbGroup.add(core);

      const rimGlow = new THREE.Mesh(
        new THREE.SphereGeometry(1.68, 64, 64),
        new THREE.MeshBasicMaterial({
          color: "#ffc8df",
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
        })
      );
      orbGroup.add(rimGlow);

      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 64, 64),
        new THREE.MeshBasicMaterial({
          color: "#ffd3e6",
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
        })
      );
      orbGroup.add(atmosphere);

      const ambient = new THREE.AmbientLight("#ffeef6", 0.82);
      const keyLight = new THREE.DirectionalLight("#ffd8e8", 2.05);
      keyLight.position.set(4.2, 3.1, 5.4);
      const fillLight = new THREE.PointLight("#ffe4ef", 1.02, 19);
      fillLight.position.set(2.2, -1.8, 3.1);
      const shadowLight = new THREE.DirectionalLight("#7b3d55", 0.3);
      shadowLight.position.set(-4.2, -2.8, -5.5);
      const rimLight = new THREE.PointLight("#ffb2ce", 1.15, 22);
      rimLight.position.set(-3.8, 1.4, -4.5);
      scene.add(ambient, keyLight, fillLight, shadowLight, rimLight);

      let frame = 0;
      const clock = new THREE.Clock();
      let autoSpin = 0;
      const projected = new THREE.Vector3();
      const hotspotRadius = 1.57;
      const render = () => {
        if (isDisposed) return;

        const elapsed = clock.getElapsedTime();
        autoSpin += 0.0012;

        const targetX = targetRotation.current.x * 0.012;
        const targetY = targetRotation.current.y * 0.012 + autoSpin;
        orbGroup.rotation.x += (targetX - orbGroup.rotation.x) * 0.08;
        orbGroup.rotation.y += (targetY - orbGroup.rotation.y) * 0.08;

        orb.rotation.z = Math.sin(elapsed * 0.6) * 0.09;
        core.rotation.y = -elapsed * 0.3;
        rimGlow.scale.setScalar(1 + Math.sin(elapsed * 1.1) * 0.01);
        atmosphere.scale.setScalar(1 + Math.sin(elapsed * 0.7) * 0.02);

        for (const spot of hotspotVectors) {
          const node = hotspotNodeRefs.current[spot.id];
          if (!node) continue;

          const point = rotatePoint(
            {
              x: spot.x * hotspotRadius,
              y: spot.y * hotspotRadius,
              z: spot.z * hotspotRadius,
            },
            orbGroup.rotation.x,
            orbGroup.rotation.y
          );

          projected.set(point.x, point.y, point.z).project(camera);
          const x = (projected.x * 0.5 + 0.5) * orbSize - orbSize / 2;
          const y = (-projected.y * 0.5 + 0.5) * orbSize - orbSize / 2;
          const isFront = point.z > -0.02;
          const depthScale = 1 - projected.z * 0.16;
          const tilt = point.x * 8;

          node.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${depthScale}) rotate(${tilt}deg)`;
          node.style.opacity = isFront ? "1" : "0";
          node.style.pointerEvents = isFront ? "auto" : "none";
          node.style.zIndex = isFront ? "16" : "2";
        }

        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      render();
      setThreeReady(true);

      cleanup = () => {
        cancelAnimationFrame(frame);
        geometry.dispose();
        material.dispose();
        core.geometry.dispose();
        (core.material as ThreeModule["MeshBasicMaterial"]).dispose();
        rimGlow.geometry.dispose();
        (rimGlow.material as ThreeModule["MeshBasicMaterial"]).dispose();
        atmosphere.geometry.dispose();
        (atmosphere.material as ThreeModule["MeshBasicMaterial"]).dispose();
        renderer.dispose();
      };
    };

    mountThreeOrb().catch(() => {
      setThreeReady(false);
    });

    return () => {
      isDisposed = true;
      cleanup();
    };
  }, [hotspotVectors]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    lastPoint.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !lastPoint.current) return;
    const dx = event.clientX - lastPoint.current.x;
    const dy = event.clientY - lastPoint.current.y;
    lastPoint.current = { x: event.clientX, y: event.clientY };
    setRotY((prev) => prev + dx * 0.2);
    setRotX((prev) => prev - dy * 0.2);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    lastPoint.current = null;
  };

  useEffect(() => {
    const step = 2.2;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        setRotY((prev) => prev - step);
        event.preventDefault();
      }

      if (event.key === "ArrowRight") {
        setRotY((prev) => prev + step);
        event.preventDefault();
      }

      if (event.key === "ArrowUp") {
        setRotX((prev) => prev - step);
        event.preventDefault();
      }

      if (event.key === "ArrowDown") {
        setRotX((prev) => prev + step);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleAudio = async () => {
    if (!audioRef.current) return;
    const next = !isPlaying;
    setIsPlaying(next);
    if (next) {
      await audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  };

  const handleGlobalMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX: x, clientY: y } = e;
    setLensPos({ x, y });
  };

  const handleGlobalMouseLeave = () => {
    setLensActive(false);
    setLensPos({ x: -9999, y: -9999 });
  };

  // The clip path string used by the handwriting overlay
  const clipPath = lensActive
    ? `circle(${LENS_RADIUS}px at ${lensPos.x}px ${lensPos.y}px)`
    : `circle(0px at ${lensPos.x}px ${lensPos.y}px)`;

  return (
    <div
      className="relative min-h-screen bg-[#fff9fc] text-[#6f6761] overflow-hidden"
      onMouseMove={handleGlobalMouseMove}
      onMouseLeave={handleGlobalMouseLeave}
    >
      <div className="pointer-events-none absolute inset-0 z-0 bg-white bg-[linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[size:36px_36px]" />

      {/* ─── BASE LAYER ──────────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
        <div className="pointer-events-none absolute inset--2 z-0 rounded-[32px] border border-[#f4d9e5]/70 shadow-[0_0_40px_rgba(246,198,220,0.28),inset_0_0_28px_rgba(255,221,237,0.22)]" />

        <div className="pointer-events-none absolute inset-0 z-0">
          {floatingDots.map((dot, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full bg-[#f7d7e7]"
              style={{
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                boxShadow: "0 0 14px rgba(247, 197, 220, 0.9)",
              }}
              animate={{
                x: [0, dot.dx, 0, -dot.dx * 0.6, 0],
                y: [0, dot.dy, 0, -dot.dy * 0.65, 0],
                opacity: [0.3, 0.85, 0.45, 0.8, 0.3],
                scale: [0.9, 1.15, 0.95, 1.1, 0.9],
              }}
              transition={{
                duration: dot.duration,
                repeat: Infinity,
                ease: "easeInOut",
                delay: dot.delay,
              }}
            />
          ))}
        </div>

        

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="relative flex items-center justify-center"
          style={{ width: orbSize, height: orbSize }}
        >
          <div className="pointer-events-none absolute -bottom-24 left-1/2 h-16 w-[75%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(40,25,30,0.35)_0%,rgba(40,25,30,0.16)_40%,transparent_70%)] blur-2xl" />
          {/* Left heading — positioned exactly as original, sits behind orb */}
          <div
            ref={leftTextRef}
            className="pointer-events-auto absolute -left-[89%] top-1/2 z-0 w-[85%] -translate-y-1/2"
            onMouseEnter={() => setLensActive(true)}
            onMouseLeave={() => setLensActive(false)}
          >
            <div className="font-[family-name:var(--font-instrument-serif)] text-6xl sm:text-7xl md:text-8xl font-semibold tracking-tight text-black">
              hi, i&apos;m sruthi vangavolu
            </div>
          </div>

          {/* Orb */}
          <div
            className="relative rounded-full z-10"
            style={{
              width: orbSize,
              height: orbSize,
            }}
          >
            <div
              className="pointer-events-none absolute -inset-8 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(255, 212, 231, 0.66) 0%, rgba(255, 212, 231, 0.32) 46%, rgba(255, 212, 231, 0) 78%)",
              }}
            />
            {!threeReady ? (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, rgba(255,249,251,0.97) 0%, rgba(252,225,236,0.92) 35%, rgba(244,196,216,0.78) 65%, rgba(228,172,195,0.68) 100%)",
                  boxShadow: "0 40px 120px rgba(214,170,186,0.35)",
                }}
              />
            ) : null}
            <canvas
              ref={orbCanvasRef}
              className="absolute inset-0 h-full w-full rounded-full"
              aria-hidden="true"
            />

            {hotspots.map((spot) => (
              <div
                key={spot.id}
                ref={(node) => {
                  hotspotNodeRefs.current[spot.id] = node;
                }}
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[0.85rem] font-semibold uppercase tracking-[0.3em] text-[#665f63] [text-shadow:0_1px_2px_rgba(255,255,255,0.6)] transition-opacity duration-200"
                style={{ opacity: 0 }}
              >
                <button
                  onClick={() => setActive(spot)}
                  className={`overflow-hidden rounded-full border border-black/80 bg-white shadow-[0_14px_34px_rgba(30,20,25,0.2)] transition hover:scale-105 ${
                    spot.id === "about" ? "h-16 w-16" : "h-14 w-14"
                  }`}
                  aria-label={spot.label}
                >
                  <img
                    src={
                      {
                        about: "/IMG_2863.jpg",
                        gallery: "/IMG_2860.jpg",
                        "dance-gallery": "/IMG_2860.jpg",
                        projects: "/IMG_2859.jpg",
                        contact: "/IMG_2861.jpg",
                        updates: "/IMG_2862.jpg",
                      }[spot.id]
                    }
                    alt={spot.label}
                    className="h-full w-full object-contain"
                  />
                </button>
                <span className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] -translate-x-1/2 whitespace-nowrap">
                  {spot.label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right text — base */}
        <div
          ref={rightTextRef}
          className="absolute top-1/2 -translate-y-1/2 w-[28%] font-[family-name:var(--font-instrument-serif)] text-2xl sm:text-3xl leading-[1.3] text-black pointer-events-auto"
          style={{ left: `calc(50% + ${orbSize / 2 + 24}px)` }}
          onMouseEnter={() => setLensActive(true)}
          onMouseLeave={() => setLensActive(false)}
        >
          i&apos;m an 18yr old studying computer science at georgia tech. this is my
          planet — click the icons to explore me: my art, projects, and updates.
          everything here is a small part of my world.
          <p className="mt-3 text-sm font-normal leading-[1.3]">
            use trackpad or arrow keys to control the orb
          </p>
        </div>

        <button
          onClick={toggleAudio}
          className="absolute bottom-6 right-0 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-[#000000]"
        >
          <span>what i&apos;m listening to rn: burgundy - chances</span>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e4dbd7] text-[#9a8f8b]">
            {isPlaying ? "🔈" : "🔇"}
          </span>
        </button>
        <audio ref={audioRef} src="/burgundy-chances.mp3" loop preload="auto" />
      </div>

      {/* ─── HANDWRITING REVEAL OVERLAY (clipped to lens circle) ─────────── */}
      {/*
        This layer sits on top of everything. Its clip-path punches a hole
        the size of the lens wherever the cursor is. Inside that hole we show
        ONLY the handwriting images (white background underneath so the base
        text doesn't bleed through). Outside the clip = display:none via
        clip-path = 0px, so the base layer is fully visible everywhere else.
      */}
      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          clipPath,
          transition: "clip-path 180ms ease",
          // White background so base text is completely hidden inside lens
          backgroundColor: "white",
        }}
      >
        {/* Replicate layout exactly so handwriting images land in the right spots */}
        <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6">
          {/* Left handwriting image */}
          <div
            className="pointer-events-none absolute -left-[76%] top-1/2 z-0 w-[87%] -translate-y-1/2"
          >
            <img
              src="/handwriting-title.png"
              alt="handwritten title"
              className="w-full"
              style={{
                transform: "translate(52%, -2%) scale(0.50)",
              }}
            />
          </div>

          {/* Right handwriting image */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[28%]"
            style={{ left: `calc(50% + ${orbSize / 2 + 24}px)` }}
          >
            <img
              src="/handwriting-paragraph.png"
              alt="handwritten subtitle"
              className="w-full"
              style={{
                transform: "translate(-15px, -18px) scale(1.07)",
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── LENS RING (decorative circle outline) ───────────────────────── */}
      <div
        className="pointer-events-none absolute z-30 rounded-full border border-[rgba(100,80,80,0.25)]"
        style={{
          width: LENS_RADIUS * 2,
          height: LENS_RADIUS * 2,
          left: lensPos.x - LENS_RADIUS,
          top: lensPos.y - LENS_RADIUS,
          opacity: lensActive ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* ─── MODAL ───────────────────────────────────────────────────────── */}
      {active?.id === "dance-gallery" ? (
        <div className="fixed inset-0 z-[9999]">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setActive(null)}
          />
          <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col px-6 py-10 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-[family-name:var(--font-instrument-serif)] tracking-[0.18em] lowercase">
                dance
              </h2>
              <button
                onClick={() => setActive(null)}
                className="rounded-full border border-white/40 px-4 py-2 text-xs tracking-[0.2em] lowercase text-white/80 hover:text-white"
              >
                close
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-x-auto pb-4">
              <div className="flex gap-6">
                {[
                  "/IMG_3119.jpg",
                  "/IMG_3974.jpg",
                  "/IMG_3978.jpg",
                  "/IMG_3981.jpg",
                  "/IMG_3983.jpg",
                  "/IMG_5135.jpg",
                  "/IMG_5272.jpg",
                  "/IMG_7827.jpg",
                  "/IMG_9663.jpg",
                  "/_DSC2530.jpg",
                ].map((src, i) => (
                  <motion.div
                    key={`dance-slot-${src}`}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.5 }}
                    className="aspect-[3/4] w-[220px] flex-shrink-0 overflow-hidden rounded-3xl border border-white/20 bg-white/5"
                  >
                    <img
                      src={src}
                      alt="dance gallery"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (!target.dataset.fallback) {
                          target.dataset.fallback = "true";
                          target.src = src.replace(".jpg", ".JPG");
                        }
                      }}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="-mt-4 max-w-2xl text-sm tracking-[0.18em] lowercase text-white/80">
              ive been a classically trained dancer for over 8 years now! i had
              my official solo debut on july 12th, 2025. dance has given me the
              most beautiful community and i&apos;ll continue it for the rest of my
              life. enjoy some pictures from my debut photoshoot!
            </div>
          </div>
        </div>
      ) : null}

      {active?.id === "gallery" ? (
        <div className="fixed inset-0 z-[9999]">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setActive(null)}
          />
          <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col px-6 py-10 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-[family-name:var(--font-instrument-serif)] tracking-[0.18em] lowercase">
                art
              </h2>
              <button
                onClick={() => setActive(null)}
                className="rounded-full border border-white/40 px-4 py-2 text-xs tracking-[0.2em] lowercase text-white/80 hover:text-white"
              >
                close
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-x-auto pb-4">
              <div className="flex gap-6">
                {[
                  "/IMG_1762.jpg",
                  "/IMG_1785.jpg",
                  "/IMG_1893.jpg",
                  "/IMG_1940.jpg",
                  "/IMG_1964.jpg",
                  "/IMG_2166.jpg",
                  "/IMG_2171.jpg",
                  "/IMG_7619.jpg",
                  "/IMG_7976.jpg",
                  "/IMG_8255.jpg",
                  "/IMG_8576.jpg",
                ].map((src, i) => (
                  <motion.div
                    key={`art-slot-${src}`}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.5 }}
                    className="aspect-[3/4] w-[220px] flex-shrink-0 overflow-hidden rounded-3xl border border-white/20 bg-white/5"
                  >
                    <img
                      src={src}
                      alt="art gallery"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (!target.dataset.fallback) {
                          target.dataset.fallback = "true";
                          target.src = src.replace(".jpg", ".JPG");
                        }
                      }}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="-mt-4 max-w-2xl text-sm tracking-[0.18em] lowercase text-white/80">
              i&apos;ve been doodling and painting since the second i picked up a
              pencil. although i never took it too seriously and kept it as a
              hobby on the side, i&apos;ve never let go of it. i took ap art in my
              junior year of high school and somehow scored a 5, and since then
              i&apos;ve also sold a couple of paintings. i haven&apos;t done as much since
              getting to college but i hope to have my own art business later in
              life!
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={Boolean(
          active &&
            active.id !== "dance-gallery" &&
            active.id !== "gallery"
        )}
        onOpenChange={() => setActive(null)}
        backdrop="blur"
        classNames={{
          base:
            "bg-white border border-[#ece7e2] bg-[linear-gradient(to_right,rgba(0,0,0,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:28px_28px]",
          header: "text-[#4f4843]",
          body: "text-[#6d6762]",
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="text-lg font-[family-name:var(--font-instrument-serif)]">
                {active?.label}
              </ModalHeader>
              <ModalBody>
                {active?.id === "gallery" || active?.id === "dance-gallery" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="relative"
                  >
                    <div
                      className="relative mx-auto flex h-[360px] w-full items-center justify-center"
                      style={{ perspective: "1200px" }}
                    >
                      {Array.from({ length: 7 }).map((_, i) => {
                        const total = 7;
                        const pos = (i - galleryIndex + total) % total;
                        const depth = Math.min(pos, 5);
                        const isTop = pos === 0;
                        return (
                          <motion.div
                            key={`gallery-slot-${i}`}
                            className="absolute left-1/2 top-1/2 h-[260px] w-[200px] -translate-x-1/2 -translate-y-1/2"
                            animate={{
                              x: depth * 18,
                              y: depth * 12,
                              rotateZ: -1.6 * depth,
                              rotateY: isTop ? 0 : -8 - depth * 2,
                              scale: 1 - depth * 0.03,
                              opacity: pos > 5 ? 0 : 1,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 140,
                              damping: 20,
                            }}
                            style={{ zIndex: 20 - pos }}
                            onClick={() =>
                              setGalleryIndex((prev) => (prev + 1) % total)
                            }
                          >
                            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-black/80 bg-white shadow-[0_16px_40px_rgba(30,20,25,0.08)]">
                              <div className="absolute left-0 top-0 h-full w-[10px] bg-[#f2ebe7]" />
                              <div className="absolute left-3 top-3 right-3 bottom-3 rounded-xl border border-black/60 bg-white" />
                              <div className="absolute bottom-5 left-5 right-5 h-2 rounded-full bg-[#e7dfdc]" />
                              <div className="absolute bottom-2 left-5 right-12 h-2 rounded-full bg-[#efe8e5]" />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-center text-[0.65rem] uppercase tracking-[0.4em] text-[#a79b97]">
                      tap to flip
                    </p>
                    <div className="mt-3 rounded-2xl border border-[#eee6e2] bg-white px-4 py-3 text-xs text-[#8a807b]">
                      I've been a classically trained dancer for the past 
                      7 years! I performed my solo debut on July 12th, 2025,
                      one of my proudest moments. I've found a wonderful community
                      in dance and will continue it for the rest of my life. One 
                      of my photos was even featured at the 2025 SCAD showcase!
                    </div>
                  </motion.div>
                ) : null}

                {active?.id === "about" ? (
                  <div className="grid gap-5 sm:grid-cols-[1.1fr_1.4fr]">
                    <motion.div
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.45 }}
                      className="grid"
                    >
                      <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-[#eee6e2] bg-white shadow-[0_10px_30px_rgba(30,20,25,0.05)]">
                        <img
                          src="/IMG_6159.jpg"
                          alt="about me"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.45 }}
                      className="space-y-3 text-sm leading-relaxed font-[family-name:var(--font-instrument-serif)]"
                    >
                      <p className="text-[#4f4843]">
                        hi! i&apos;m sruthi and i&apos;m a cs student at georgia tech.
                        i was born in edison, new jersey but i&apos;ve grown up in
                        johns creek, georgia. i love drawing, spending time outside,
                        painting, dancing, and binging movies.
                      </p>
                      <p className="text-[#4f4843]">
                        right now, i&apos;m studying computer science with a growing
                        interest in human-computer interaction. this space is a
                        collection of things i&apos;m learning, making, and becoming.
                      </p>
                    </motion.div>
                  </div>
                ) : null}

                {active?.id === "updates" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="rounded-2xl border border-[#eee6e2] bg-white p-5 shadow-[0_10px_30px_rgba(30,20,25,0.06)]"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[#a79b97]">
                      quote of the moment
                    </p>
                    <p className="mt-4 text-lg font-[family-name:var(--font-instrument-serif)] text-[#4f4843]">
                      “Tell me, what is it you plan to do with your one wild and precious life?”
                      — Mary Oliver
                    </p>
                  </motion.div>
                ) : null}

                {active?.id === "contact" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="space-y-4"
                  >
                    <div className="grid gap-3">
                      <a
                        href="mailto:srisruthi369@gmail.com"
                        className="flex items-center gap-3 rounded-2xl border border-[#eee6e2] bg-white px-4 py-3 text-sm text-[#5f5752] transition hover:translate-x-1 hover:border-[#e0d6d2]"
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#eee6e2] bg-[#fbf9f8] text-xs font-semibold text-[#7a716b]">
                          @
                        </span>
                        srisruthi369@gmail.com
                      </a>
                      <a
                        href="mailto:svangavolu6@gatech.edu"
                        className="flex items-center gap-3 rounded-2xl border border-[#eee6e2] bg-white px-4 py-3 text-sm text-[#5f5752] transition hover:translate-x-1 hover:border-[#e0d6d2]"
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#eee6e2] bg-[#fbf9f8] text-xs font-semibold text-[#7a716b]">
                          @
                        </span>
                        svangavolu6@gatech.edu
                      </a>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <a
                        href="https://github.com/SruthiVangavolu7"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-full border border-[#eee6e2] bg-white px-4 py-2 text-xs uppercase tracking-[0.25em] text-[#5f5752] transition hover:-translate-y-0.5 hover:border-[#e0d6d2]"
                      >
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#eee6e2] bg-[#fbf9f8] text-[0.55rem] font-semibold text-[#7a716b]">
                          gh
                        </span>
                        github
                      </a>
                      <a
                        href="https://www.linkedin.com/in/sruthi-vangavolu-4021502a7"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-full border border-[#eee6e2] bg-white px-4 py-2 text-xs uppercase tracking-[0.25em] text-[#5f5752] transition hover:-translate-y-0.5 hover:border-[#e0d6d2]"
                      >
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#eee6e2] bg-[#fbf9f8] text-[0.6rem] font-semibold text-[#7a716b]">
                          in
                        </span>
                        linkedin
                      </a>
                    </div>
                  </motion.div>
                ) : null}

                {active?.id === "projects" ? (
                  <p className="text-xs uppercase tracking-[0.3em] text-[#a79b97]">
                    coming soon...
                  </p>
                ) : null}

                {![
                  "gallery",
                  "dance-gallery",
                  "about",
                  "updates",
                  "contact",
                  "projects",
                ].includes(active?.id || "") && active?.content ? (
                  <p className="text-sm leading-relaxed">{active.content}</p>
                ) : null}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
