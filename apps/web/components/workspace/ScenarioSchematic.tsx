"use client";

import { Line, MapControls, OrthographicCamera, RoundedBox } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Scenario } from "@/lib/types";

export type SchematicMode = "layout" | "sensors";

const floorColor = "#e9e9e4";
const routeColor = "#171715";
const mint = "#6ee7b7";

function point(x: number, y: number, height = 0.035) {
  return new THREE.Vector3(x, height, -y);
}

function Route({ scenario }: { scenario: Scenario }) {
  const obstacle = scenario.objects.find((item) => item.class === "obstacle");
  const start = scenario.robot.start_pose.position;
  const goal = scenario.robot.goal_pose.position;
  const route = useMemo(() => {
    if (!obstacle) return [point(start.x, start.y), point(goal.x, goal.y)];
    const direction = obstacle.pose.position.y >= 0 ? -1 : 1;
    const detourY = obstacle.pose.position.y + direction * 1.05;
    return [
      point(start.x, start.y),
      point(Math.max(start.x + 0.6, obstacle.pose.position.x - 0.9), start.y),
      point(obstacle.pose.position.x - 0.55, detourY),
      point(obstacle.pose.position.x + 0.75, detourY),
      point(Math.min(goal.x - 0.5, obstacle.pose.position.x + 1.25), goal.y),
      point(goal.x, goal.y),
    ];
  }, [goal.x, goal.y, obstacle, start.x, start.y]);

  return (
    <Line
      color={routeColor}
      dashScale={2}
      dashSize={0.12}
      dashed
      gapSize={0.09}
      lineWidth={2}
      points={route}
    />
  );
}

function CameraCone({
  color,
  fov,
  range,
  rotation,
}: {
  color: string;
  fov: number;
  range: number;
  rotation: number;
}) {
  const half = THREE.MathUtils.degToRad(fov / 2);
  const shape = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0,
      0,
      0,
      Math.cos(half) * range,
      0,
      Math.sin(half) * range,
      Math.cos(-half) * range,
      0,
      Math.sin(-half) * range,
    ]);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    return geometry;
  }, [half, range]);

  return (
    <mesh geometry={shape} position={[0, 0.055, 0]} rotation={[0, rotation, 0]}>
      <meshBasicMaterial
        color={color}
        depthWrite={false}
        opacity={0.16}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  );
}

function SensorOverlay({ scenario }: { scenario: Scenario }) {
  const yaw = -scenario.robot.start_pose.yaw;
  return (
    <group
      position={[
        scenario.robot.start_pose.position.x,
        0,
        -scenario.robot.start_pose.position.y,
      ]}
    >
      {scenario.sensors.rgb_camera.enabled ? (
        <CameraCone
          color="#3b82f6"
          fov={scenario.sensors.rgb_camera.fov_deg}
          range={2.4}
          rotation={yaw}
        />
      ) : null}
      {scenario.sensors.depth_camera.enabled ? (
        <CameraCone
          color="#d97706"
          fov={scenario.sensors.depth_camera.fov_deg * 0.72}
          range={1.9}
          rotation={yaw}
        />
      ) : null}
      {scenario.sensors.lidar.enabled ? (
        <>
          {[0.65, 1.15, 1.65, 2.15].map((radius) => (
            <mesh
              key={radius}
              position={[0, 0.045, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[radius - 0.008, radius + 0.008, 96]} />
              <meshBasicMaterial color={mint} opacity={0.38} transparent />
            </mesh>
          ))}
          {Array.from({ length: 24 }, (_, index) => {
            const angle = (index / 24) * Math.PI * 2;
            return (
              <Line
                color={mint}
                key={angle}
                lineWidth={0.65}
                opacity={0.18}
                points={[
                  new THREE.Vector3(0, 0.045, 0),
                  new THREE.Vector3(
                    Math.cos(angle) * 2.15,
                    0.045,
                    Math.sin(angle) * 2.15,
                  ),
                ]}
                transparent
              />
            );
          })}
        </>
      ) : null}
    </group>
  );
}

function Warehouse({ scenario, mode }: { scenario: Scenario; mode: SchematicMode }) {
  const obstacle = scenario.objects.find((item) => item.class === "obstacle");
  const actor = scenario.dynamic_actors[0];
  const cup = scenario.objects.find((item) => item.class === "cup");
  const goal = scenario.robot.goal_pose.position;
  const start = scenario.robot.start_pose.position;
  const lowFriction = scenario.environment.physics.floor_friction < 0.3;

  return (
    <>
      <color attach="background" args={["#f4f4f1"]} />
      <ambientLight intensity={2.5} />
      <directionalLight intensity={1.8} position={[5, 9, 4]} />

      <mesh receiveShadow position={[2.7, -0.06, 0]}>
        <boxGeometry args={[7.4, 0.1, 4.6]} />
        <meshStandardMaterial color={floorColor} roughness={0.96} />
      </mesh>
      <gridHelper
        args={[7.2, 18, "#d1d1cb", "#ddddda"]}
        position={[2.7, 0.005, 0]}
      />

      {[-1.88, 1.88].map((z) => (
        <group key={z}>
          {[0.25, 1.7, 3.15, 4.6, 6.05].map((x) => (
            <RoundedBox args={[1.05, 0.18, 0.38]} key={x} position={[x, 0.09, z]} radius={0.04}>
              <meshStandardMaterial color="#cbc9c1" roughness={0.8} />
            </RoundedBox>
          ))}
        </group>
      ))}

      {lowFriction ? (
        <mesh position={[2.7, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 1.4]} />
          <meshBasicMaterial color="#bdeee7" opacity={0.48} transparent />
        </mesh>
      ) : null}

      <Route scenario={scenario} />

      <group position={[start.x, 0.22, -start.y]} rotation={[0, -scenario.robot.start_pose.yaw, 0]}>
        <RoundedBox args={[0.55, 0.24, 0.42]} radius={0.08}>
          <meshStandardMaterial color="#151513" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0.08, 0.2, 0]}>
          <cylinderGeometry args={[0.075, 0.065, 0.16, 20]} />
          <meshStandardMaterial color={cup ? "#93c5d8" : "#d6d6d0"} transparent opacity={0.88} />
        </mesh>
        <mesh position={[0.31, 0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.1, 0.18, 3]} />
          <meshBasicMaterial color={mint} />
        </mesh>
      </group>

      {obstacle ? (
        <RoundedBox
          args={[
            obstacle.dimensions.x,
            Math.max(0.18, obstacle.dimensions.z * 0.36),
            obstacle.dimensions.y,
          ]}
          position={[
            obstacle.pose.position.x,
            Math.max(0.09, obstacle.dimensions.z * 0.18),
            -obstacle.pose.position.y,
          ]}
          radius={0.035}
          rotation={[0, -obstacle.pose.yaw, 0]}
        >
          <meshStandardMaterial color="#df7b32" roughness={0.72} />
        </RoundedBox>
      ) : null}

      {actor ? (
        <>
          <mesh
            position={[
              actor.trajectory[0].x,
              0.25,
              -actor.trajectory[0].y,
            ]}
          >
            <cylinderGeometry args={[0.15, 0.15, 0.5, 20]} />
            <meshStandardMaterial color="#caa33c" />
          </mesh>
          <Line
            color="#b68a19"
            dashScale={1.5}
            dashSize={0.08}
            dashed
            gapSize={0.07}
            lineWidth={1.4}
            points={actor.trajectory.map((item) => point(item.x, item.y, 0.045))}
          />
        </>
      ) : null}

      <mesh position={[goal.x, 0.02, -goal.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.29, 0.43, 48]} />
        <meshBasicMaterial color="#27a96d" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[goal.x, 0.018, -goal.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 48]} />
        <meshBasicMaterial color="#bcebd6" side={THREE.DoubleSide} />
      </mesh>

      {mode === "sensors" ? <SensorOverlay scenario={scenario} /> : null}

      <OrthographicCamera makeDefault position={[3, 8, 4.2]} zoom={96} />
      <MapControls
        enableDamping
        enableRotate={false}
        maxZoom={150}
        minZoom={68}
        screenSpacePanning
        target={[2.7, 0, 0]}
      />
    </>
  );
}

export default function ScenarioSchematic({
  mode,
  scenario,
}: {
  mode: SchematicMode;
  scenario: Scenario;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      shadows
    >
      <Warehouse mode={mode} scenario={scenario} />
    </Canvas>
  );
}
