"use client";

import { Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group } from "three";
import type { Scenario } from "@/lib/types";

function Robot({ scenario, running }: { scenario: Scenario; running: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || !running) return;
    const t = (clock.getElapsedTime() * 0.08) % 1;
    const x = scenario.robot.start_pose.position.x * (1 - t) + scenario.robot.goal_pose.position.x * t;
    ref.current.position.x = x;
    ref.current.position.y = Math.sin(t * Math.PI * 2) * 0.18;
  });
  return (
    <group
      ref={ref}
      position={[
        scenario.robot.start_pose.position.x,
        scenario.robot.start_pose.position.z,
        -scenario.robot.start_pose.position.y,
      ]}
    >
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.68, 0.38, 0.56]} />
        <meshStandardMaterial color="#32e6cf" metalness={0.55} roughness={0.26} />
      </mesh>
      <mesh position={[0.06, 0.59, 0]}>
        <cylinderGeometry args={[0.09, 0.075, 0.23, 20]} />
        <meshPhysicalMaterial color="#c2f6ff" transparent opacity={0.8} roughness={0.12} />
      </mesh>
      {[-0.26, 0.26].map((z) => (
        <mesh key={z} position={[0, 0.12, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.08, 18]} />
          <meshStandardMaterial color="#071013" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <coneGeometry args={[3.2, 5.6, 40, 1, true, 0, Math.PI * 2]} />
        <meshBasicMaterial color="#28e7d1" wireframe transparent opacity={0.045} />
      </mesh>
    </group>
  );
}

function WarehouseScene({ scenario, running }: { scenario: Scenario; running: boolean }) {
  const box = scenario.objects.find((item) => item.class === "obstacle");
  const actor = scenario.dynamic_actors[0];
  const route = useMemo(
    () => [
      new THREE.Vector3(0, 0.04, 0),
      new THREE.Vector3(1.85, 0.04, 0),
      new THREE.Vector3(2.35, 0.04, 0.85),
      new THREE.Vector3(3.15, 0.04, 0.85),
      new THREE.Vector3(3.7, 0.04, 0),
      new THREE.Vector3(5.4, 0.04, 0),
    ],
    [],
  );
  return (
    <>
      <color attach="background" args={["#071012"]} />
      <fog attach="fog" args={["#071012", 7, 17]} />
      <ambientLight intensity={1.1} color="#8db6b2" />
      <directionalLight position={[3, 8, 4]} intensity={3.2} color="#d6fff6" castShadow />
      <pointLight position={[3, 2.8, -2]} color="#ff7a3d" intensity={18} distance={5} />
      <mesh receiveShadow position={[2.7, -0.04, 0]}>
        <boxGeometry args={[12, 0.08, 4.4]} />
        <meshStandardMaterial color="#18262a" metalness={0.35} roughness={0.38} />
      </mesh>
      <gridHelper args={[12, 24, "#39565c", "#1d3438"]} position={[2.7, 0.01, 0]} />
      {[-1.9, 1.9].map((z) => (
        <group key={z}>
          {[0.3, 2.0, 3.7, 5.4].map((x) => (
            <mesh key={x} position={[x, 0.72, z]}>
              <boxGeometry args={[1.1, 1.45, 0.28]} />
              <meshStandardMaterial color="#26383d" metalness={0.5} roughness={0.45} />
            </mesh>
          ))}
        </group>
      ))}
      <Line points={route} color="#36ead3" lineWidth={2.2} dashed dashScale={2} dashSize={0.16} gapSize={0.12} />
      <Robot scenario={scenario} running={running} />
      {box ? (
        <mesh
          castShadow
          position={[box.pose.position.x, box.pose.position.z / 2, -box.pose.position.y]}
          rotation={[0, box.pose.yaw, 0]}
        >
          <boxGeometry args={[box.dimensions.x, box.dimensions.z, box.dimensions.y]} />
          <meshStandardMaterial color="#f05a27" roughness={0.45} />
        </mesh>
      ) : null}
      {actor ? (
        <>
          <mesh position={[actor.trajectory[0].x, 0.86, -actor.trajectory[0].y]}>
            <capsuleGeometry args={[0.19, 1.3, 6, 12]} />
            <meshStandardMaterial color="#efc74e" />
          </mesh>
          <Line
            points={actor.trajectory.map((point) => new THREE.Vector3(point.x, 0.08, -point.y))}
            color="#efc74e"
            lineWidth={1.4}
            dashed
          />
        </>
      ) : null}
      <mesh
        position={[
          scenario.robot.goal_pose.position.x,
          0.03,
          -scenario.robot.goal_pose.position.y,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.34, 0.48, 40]} />
        <meshBasicMaterial color="#47f08a" side={THREE.DoubleSide} />
      </mesh>
      <PerspectiveCamera makeDefault position={[7.7, 6.4, 7.8]} fov={42} />
      <OrbitControls
        target={[2.7, 0.25, 0]}
        minDistance={4}
        maxDistance={15}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}

export default function ScenePreview({
  scenario,
  running = false,
}: {
  scenario: Scenario;
  running?: boolean;
}) {
  return (
    <Canvas dpr={[1, 1.5]} shadows gl={{ antialias: true, powerPreference: "high-performance" }}>
      <WarehouseScene scenario={scenario} running={running} />
    </Canvas>
  );
}

