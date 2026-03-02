import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import gsap from 'gsap'
import * as THREE from 'three'

const ASSEMBLY_SECONDS = 2.5
const LOGO_PATH = '/sb-logo.png'
const CAMERA_FOV = 48
const DESKTOP_CAMERA_Z = 7.4
const MOBILE_VIEWPORT_MAX_WIDTH = 820
const MOBILE_TARGET_WORLD_WIDTH = 9.6
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
const DESKTOP_QUALITY_PROFILE = {
  particleCount: 80000,
  pointSize: 0.015,
  maxDpr: 1.75,
  enablePointerInteraction: true,
  enableBloom: true,
}
const MOBILE_QUALITY_PROFILE = {
  particleCount: 30000,
  pointSize: 0.019,
  maxDpr: 1.1,
  enablePointerInteraction: false,
  enableBloom: false,
}
const AUTO_SPIN_SPEED = 0.055
const TWO_PI = Math.PI * 2

const COLOR_ORANGE = [1, 0.54, 0.04]
const COLOR_RED_ORANGE = [1, 0.3, 0.08]
const COLOR_HOT_PINK = [1, 0.2, 0.58]
const COLOR_MAGENTA = [1, 0.14, 0.72]
const COLOR_VIOLET = [0.77, 0.25, 1]

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const lerp = (start, end, t) => start + (end - start) * t
const randomRange = (min, max) => min + Math.random() * (max - min)
const mixColor = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]

function isMobilePortraitViewport(width, height) {
  return width <= MOBILE_VIEWPORT_MAX_WIDTH && height > width
}

function hasCoarsePointer() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches
}

function getViewportSnapshot() {
  if (typeof window === 'undefined') {
    return DEFAULT_VIEWPORT
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function getQualityProfile(width, height) {
  if (isMobilePortraitViewport(width, height) && hasCoarsePointer()) {
    return MOBILE_QUALITY_PROFILE
  }

  return DESKTOP_QUALITY_PROFILE
}

function getRestCameraZ(width, height) {
  if (!isMobilePortraitViewport(width, height)) {
    return DESKTOP_CAMERA_Z
  }

  const aspect = clamp(width / Math.max(height, 1), 0.36, 1)
  const fovRadians = THREE.MathUtils.degToRad(CAMERA_FOV)
  const requiredZ = MOBILE_TARGET_WORLD_WIDTH / (2 * Math.tan(fovRadians * 0.5) * aspect)

  return clamp(requiredZ, DESKTOP_CAMERA_Z, 24)
}

function randomUnitVector() {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)

  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.sin(phi) * Math.sin(theta),
    z: Math.cos(phi),
  }
}

function gradientColor(x, y, range) {
  const nx = clamp((x / range + 1) * 0.5, 0, 1)
  const ny = clamp((y / range + 1) * 0.5, 0, 1)

  let color

  if (nx < 0.44) {
    color = mixColor(COLOR_ORANGE, COLOR_RED_ORANGE, nx / 0.44)
  } else {
    color = mixColor(COLOR_RED_ORANGE, COLOR_MAGENTA, (nx - 0.44) / 0.56)
  }

  const pinkCore = clamp(1 - Math.hypot(nx - 0.56, ny - 0.5) * 2.1, 0, 1)
  color = mixColor(color, COLOR_HOT_PINK, pinkCore * 0.65)

  const violetBias = clamp((nx - 0.62) * 2.4 + (ny - 0.4) * 0.65, 0, 1)
  color = mixColor(color, COLOR_VIOLET, violetBias)

  const warmBias = clamp((0.53 - nx) * 0.9 + (0.45 - ny) * 0.35, 0, 1)
  color = mixColor(color, COLOR_ORANGE, warmBias * 0.22)

  return color
}

function createFallbackMask() {
  const points = []

  for (let index = 0; index < 20000; index += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * 0.45

    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  }

  return points
}

function loadLogoMaskPoints(source, sampleSize = 360) {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = sampleSize
      canvas.height = sampleSize

      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (!context) {
        reject(new Error('Unable to create a 2D context for logo sampling.'))
        return
      }

      context.clearRect(0, 0, sampleSize, sampleSize)
      context.drawImage(image, 0, 0, sampleSize, sampleSize)

      const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data
      const mask = new Uint8Array(sampleSize * sampleSize)

      for (let y = 0; y < sampleSize; y += 1) {
        for (let x = 0; x < sampleSize; x += 1) {
          const pixelIndex = (y * sampleSize + x) * 4
          const alpha = pixels[pixelIndex + 3]
          mask[y * sampleSize + x] = alpha > 120 ? 1 : 0
        }
      }

      const points = []
      const edgePoints = []

      for (let y = 1; y < sampleSize - 1; y += 1) {
        for (let x = 1; x < sampleSize - 1; x += 1) {
          const maskIndex = y * sampleSize + x
          if (mask[maskIndex] === 0) {
            continue
          }

          const point = {
            x: x / sampleSize - 0.5,
            y: 0.5 - y / sampleSize,
          }
          points.push(point)

          const hasTransparentNeighbor =
            mask[maskIndex - 1] === 0 ||
            mask[maskIndex + 1] === 0 ||
            mask[maskIndex - sampleSize] === 0 ||
            mask[maskIndex + sampleSize] === 0 ||
            mask[maskIndex - sampleSize - 1] === 0 ||
            mask[maskIndex - sampleSize + 1] === 0 ||
            mask[maskIndex + sampleSize - 1] === 0 ||
            mask[maskIndex + sampleSize + 1] === 0

          if (hasTransparentNeighbor) {
            edgePoints.push(point)
          }
        }
      }

      if (points.length === 0) {
        const fallback = createFallbackMask()
        resolve({ points: fallback, edgePoints: fallback })
        return
      }

      resolve({
        points,
        edgePoints: edgePoints.length > 0 ? edgePoints : points,
      })
    }

    image.onerror = () => reject(new Error('Failed to load SB logo.'))
    image.src = source
  })
}

function buildParticleData(maskData, particleCount) {
  const allPoints = Array.isArray(maskData) ? maskData : maskData.points
  const edgePoints = Array.isArray(maskData) ? maskData : maskData.edgePoints

  const positions = new Float32Array(particleCount * 3)
  const starts = new Float32Array(particleCount * 3)
  const targets = new Float32Array(particleCount * 3)
  const velocities = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)

  const speeds = new Float32Array(particleCount)
  const delays = new Float32Array(particleCount)
  const seeds = new Float32Array(particleCount)
  const radii = new Float32Array(particleCount)
  const coreFlags = new Uint8Array(particleCount)
  const edgeFlags = new Uint8Array(particleCount)

  const logoScale = 8.8
  const shellCount = 5
  const safeRadius = logoScale * 1.02

  for (let index = 0; index < particleCount; index += 1) {
    const positionIndex = index * 3
    const edgeBias = Math.random() < 0.62
    const sourcePool = edgeBias ? edgePoints : allPoints
    const maskPoint = sourcePool[(Math.random() * sourcePool.length) | 0]
    const isCore = Math.random() < 0.975
    const isEdgePoint = edgeBias

    let targetX
    let targetY
    let targetZ

    if (isCore) {
      const coreJitter = isEdgePoint ? 0.0045 : 0.008
      targetX = maskPoint.x * logoScale + randomRange(-coreJitter, coreJitter)
      targetY = maskPoint.y * logoScale + randomRange(-coreJitter, coreJitter)
      targetZ = randomRange(-0.03, 0.03)
      coreFlags[index] = 1
      if (isEdgePoint) {
        edgeFlags[index] = 1
      }
    } else {
      const shell = (Math.random() * shellCount) | 0
      const shellRadius = 4.8 + shell * 1.35 + Math.random() * 0.9

      const direction = randomUnitVector()
      const logoPull = randomRange(0.01, 0.06)

      targetX = maskPoint.x * logoScale * logoPull + direction.x * shellRadius
      targetY = maskPoint.y * logoScale * logoPull + direction.y * shellRadius
      targetZ = direction.z * shellRadius * 0.22 - 2.2 + randomRange(-0.15, 0.05)

      const xyDistance = Math.hypot(targetX, targetY)
      if (xyDistance < safeRadius) {
        const angle = xyDistance > 1e-4 ? Math.atan2(targetY, targetX) : Math.random() * Math.PI * 2
        const pushedRadius = safeRadius + randomRange(1.4, 3)
        targetX = Math.cos(angle) * pushedRadius
        targetY = Math.sin(angle) * pushedRadius
        targetZ -= randomRange(0.8, 1.6)
      }
    }

    targets[positionIndex] = targetX
    targets[positionIndex + 1] = targetY
    targets[positionIndex + 2] = targetZ
    radii[index] = Math.sqrt(targetX * targetX + targetY * targetY + targetZ * targetZ)

    const entranceDirection = randomUnitVector()
    const entranceRadius = randomRange(20, 46)

    let startX = entranceDirection.x * entranceRadius
    let startY = entranceDirection.y * entranceRadius
    let startZ = entranceDirection.z * entranceRadius

    if (Math.random() < 0.3) {
      startZ = randomRange(18, 48)
    }

    starts[positionIndex] = startX
    starts[positionIndex + 1] = startY
    starts[positionIndex + 2] = startZ

    positions[positionIndex] = startX
    positions[positionIndex + 1] = startY
    positions[positionIndex + 2] = startZ

    const deltaX = targetX - startX
    const deltaY = targetY - startY
    const deltaZ = targetZ - startZ
    const inverseLength = 1 / (Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ) + 1e-6)

    const velocityStrength = randomRange(1.4, 4.8)

    velocities[positionIndex] = deltaX * inverseLength * velocityStrength
    velocities[positionIndex + 1] = deltaY * inverseLength * velocityStrength
    velocities[positionIndex + 2] = deltaZ * inverseLength * velocityStrength

    speeds[index] = randomRange(0.65, 1.15)
    delays[index] = Math.random() * 0.55
    seeds[index] = Math.random() * Math.PI * 2

    const [red, green, blue] = gradientColor(targetX, targetY, 6.5)
    let brightness = isCore ? randomRange(1.08, 1.26) : randomRange(0.02, 0.08)
    if (edgeFlags[index] === 1) {
      brightness += randomRange(0.08, 0.18)
    }

    colors[positionIndex] = clamp(red * brightness, 0, 1)
    colors[positionIndex + 1] = clamp(green * brightness, 0, 1)
    colors[positionIndex + 2] = clamp(blue * brightness, 0, 1)
  }

  return {
    count: particleCount,
    positions,
    starts,
    targets,
    velocities,
    colors,
    speeds,
    delays,
    seeds,
    radii,
    coreFlags,
    edgeFlags,
  }
}

function ParticleCloud({ isDraggingRef, particleCount, pointSize, enablePointerInteraction }) {
  const groupRef = useRef(null)
  const pointsRef = useRef(null)
  const assemblyRef = useRef({ value: 0 })
  const spinAngleRef = useRef(0)
  const mouseWorldRef = useRef(new THREE.Vector3())
  const particleDataRef = useRef(null)
  const liveGeometryRef = useRef(null)

  const pointerVector = useMemo(() => new THREE.Vector3(), [])
  const pointerDirection = useMemo(() => new THREE.Vector3(), [])

  const [geometry, setGeometry] = useState(null)

  useEffect(() => {
    let mounted = true
    const assemblyState = assemblyRef.current

    const setData = (data) => {
      particleDataRef.current = data
      liveGeometryRef.current?.dispose()

      const bufferGeometry = new THREE.BufferGeometry()
      bufferGeometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
      bufferGeometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
      liveGeometryRef.current = bufferGeometry
      setGeometry(bufferGeometry)
    }

    const build = async () => {
      assemblyState.value = 0
      setGeometry(null)

      try {
        const maskPoints = await loadLogoMaskPoints(LOGO_PATH)

        if (!mounted) {
          return
        }

        setData(buildParticleData(maskPoints, particleCount))
      } catch {
        if (!mounted) {
          return
        }

        const fallback = createFallbackMask()
        setData(buildParticleData({ points: fallback, edgePoints: fallback }, particleCount))
      }
    }

    build()

    return () => {
      mounted = false
      gsap.killTweensOf(assemblyState)
      liveGeometryRef.current?.dispose()
      liveGeometryRef.current = null
    }
  }, [particleCount])

  useEffect(() => {
    if (!geometry) {
      return undefined
    }

    const tween = gsap.to(assemblyRef.current, {
      value: 1,
      duration: ASSEMBLY_SECONDS,
      ease: 'expo.out',
    })

    return () => {
      tween.kill()
    }
  }, [geometry])

  useFrame((state, delta) => {
    const particleData = particleDataRef.current
    const frameGeometry = liveGeometryRef.current

    if (!particleData || !frameGeometry || !groupRef.current || !pointsRef.current) {
      return
    }

    const elapsed = state.clock.elapsedTime
    const assemblyProgress = assemblyRef.current.value

    const shouldUsePointerInteraction = enablePointerInteraction && assemblyProgress > 0.8

    let mouseX = 0
    let mouseY = 0
    let mouseZ = 0

    if (shouldUsePointerInteraction) {
      pointerVector.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      pointerDirection.copy(pointerVector).sub(state.camera.position).normalize()

      if (Math.abs(pointerDirection.z) > 1e-4) {
        const distance = -state.camera.position.z / pointerDirection.z
        mouseWorldRef.current.copy(state.camera.position).addScaledVector(pointerDirection, distance)
      }

      mouseX = mouseWorldRef.current.x
      mouseY = mouseWorldRef.current.y
      mouseZ = mouseWorldRef.current.z
    }

    const {
      positions,
      starts,
      targets,
      velocities,
      speeds,
      delays,
      seeds,
      radii,
      coreFlags,
    } = particleData

    const followFactor = assemblyProgress < 0.99 ? 0.18 : 0.08

    if (isDraggingRef.current) {
      const normalized = ((groupRef.current.rotation.y % TWO_PI) + TWO_PI) % TWO_PI
      spinAngleRef.current = normalized
    } else {
      spinAngleRef.current = (spinAngleRef.current + delta * AUTO_SPIN_SPEED) % TWO_PI
    }

    const spinAngle = spinAngleRef.current
    const mirrorSign = Math.cos(spinAngle) < 0 ? -1 : 1

    for (let index = 0; index < particleData.count; index += 1) {
      const positionIndex = index * 3

      const isCoreParticle = coreFlags[index] === 1
      const targetXRaw = targets[positionIndex]
      const baseY = targets[positionIndex + 1]
      const baseZ = targets[positionIndex + 2]
      const startXRaw = starts[positionIndex]
      const startY = starts[positionIndex + 1]
      const startZ = starts[positionIndex + 2]
      const velocityXRaw = velocities[positionIndex]
      const velocityY = velocities[positionIndex + 1]
      const velocityZ = velocities[positionIndex + 2]

      const baseX = targetXRaw * mirrorSign
      const startX = startXRaw * mirrorSign
      const velocityX = velocityXRaw * mirrorSign

      const localProgress = clamp((assemblyProgress - delays[index]) * speeds[index], 0, 1)
      const snapProgress = 1 - Math.pow(1 - localProgress, 4)
      const trailing = 1 - snapProgress

      let desiredX =
        startX + (baseX - startX) * snapProgress + velocityX * trailing * 0.85
      let desiredY =
        startY + (baseY - startY) * snapProgress + velocityY * trailing * 0.85
      let desiredZ =
        startZ + (baseZ - startZ) * snapProgress + velocityZ * trailing * 0.85

      if (!isCoreParticle) {
        const chaos = Math.sin(elapsed * 4 + seeds[index]) * trailing * 0.08
        desiredX += chaos * 0.12
        desiredY += chaos * 0.07
      }

      if (shouldUsePointerInteraction) {
        const interactionRadius = isCoreParticle ? 1.2 : 1.75
        const interactionRadiusSq = interactionRadius * interactionRadius

        const deltaX = baseX - mouseX
        const deltaY = baseY - mouseY
        const deltaZ = baseZ - mouseZ

        const distanceSq = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ

        if (distanceSq < interactionRadiusSq) {
          const distance = Math.sqrt(distanceSq) + 1e-4
          const influence = Math.pow(1 - distance / interactionRadius, isCoreParticle ? 1.7 : 1.28)
          const waveStrength = isCoreParticle ? 0.065 : 0.165
          const waveFreq = isCoreParticle ? 5.9 : 6.7
          const zLift = isCoreParticle ? 0.02 : 0.048
          const rippleWave =
            Math.sin(distance * waveFreq - elapsed * 2.2 + seeds[index]) * waveStrength * influence

          desiredX += (deltaX / distance) * rippleWave
          desiredY += (deltaY / distance) * rippleWave
          desiredZ += (deltaZ / distance) * rippleWave + influence * zLift
        }

        if (!isCoreParticle && radii[index] > 2.2) {
          const swirlAmount = (radii[index] / 4.2) * 0.003
          desiredX += Math.cos(elapsed * 0.12 + seeds[index]) * swirlAmount
          desiredY += Math.sin(elapsed * 0.12 + seeds[index]) * swirlAmount
        }
      }

      positions[positionIndex] += (desiredX - positions[positionIndex]) * followFactor
      positions[positionIndex + 1] += (desiredY - positions[positionIndex + 1]) * followFactor
      positions[positionIndex + 2] += (desiredZ - positions[positionIndex + 2]) * followFactor
    }

    frameGeometry.attributes.position.needsUpdate = true

    if (!isDraggingRef.current) {
      groupRef.current.rotation.y = spinAngle
      groupRef.current.rotation.x += (0 - groupRef.current.rotation.x) * 0.05
    }
  })

  if (!geometry) {
    return null
  }

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <pointsMaterial
          vertexColors
          size={pointSize}
          sizeAttenuation
          transparent
          opacity={0.88}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

function SceneRig({ quality }) {
  const controlsRef = useRef(null)
  const isDraggingRef = useRef(false)
  const returnTweenRef = useRef(null)

  const { camera, size } = useThree()
  const restCameraZ = useMemo(
    () => getRestCameraZ(size.width, size.height),
    [size.width, size.height],
  )
  useEffect(() => {
    camera.position.set(0, 0, restCameraZ)
    camera.lookAt(0, 0, 0)
  }, [camera, restCameraZ])

  useEffect(() => {
    const controls = controlsRef.current

    if (!controls) {
      return undefined
    }

    controls.target.set(0, 0, 0)
    controls.update()

    const killReturnTween = () => {
      if (returnTweenRef.current) {
        returnTweenRef.current.kill()
        returnTweenRef.current = null
      }
    }

    const onControlStart = () => {
      isDraggingRef.current = true
      killReturnTween()
    }

    const onControlEnd = () => {
      isDraggingRef.current = false
      killReturnTween()

      returnTweenRef.current = gsap
        .timeline({
          onUpdate: () => controls.update(),
        })
        .to(
          camera.position,
          {
            x: 0,
            y: 0,
            z: restCameraZ,
            duration: 1.8,
            ease: 'elastic.out(1, 0.55)',
          },
          0,
        )
        .to(
          controls.target,
          {
            x: 0,
            y: 0,
            z: 0,
            duration: 1.15,
            ease: 'power3.out',
          },
          0,
        )
    }

    controls.addEventListener('start', onControlStart)
    controls.addEventListener('end', onControlEnd)

    return () => {
      controls.removeEventListener('start', onControlStart)
      controls.removeEventListener('end', onControlEnd)
      killReturnTween()
    }
  }, [camera, restCameraZ])

  useFrame(() => {
    controlsRef.current?.update()
  })

  return (
    <>
      <ParticleCloud
        isDraggingRef={isDraggingRef}
        particleCount={quality.particleCount}
        pointSize={quality.pointSize}
        enablePointerInteraction={quality.enablePointerInteraction}
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.5}
        minAzimuthAngle={-0.75}
        maxAzimuthAngle={0.75}
        minPolarAngle={Math.PI / 2 - 0.5}
        maxPolarAngle={Math.PI / 2 + 0.5}
      />

      {quality.enableBloom && (
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.16}
            radius={0.95}
            luminanceThreshold={0.02}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </>
  )
}

export default function SoundbankScene() {
  const [viewport, setViewport] = useState(getViewportSnapshot)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateViewport = () => {
      setViewport(getViewportSnapshot())
    }

    window.addEventListener('resize', updateViewport, { passive: true })
    window.addEventListener('orientationchange', updateViewport, { passive: true })
    updateViewport()

    return () => {
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
    }
  }, [])

  const quality = useMemo(
    () => getQualityProfile(viewport.width, viewport.height),
    [viewport.width, viewport.height],
  )

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, quality.maxDpr]}
      camera={{ fov: CAMERA_FOV, near: 0.1, far: 120, position: [0, 0, DESKTOP_CAMERA_Z] }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#000000']} />
      <SceneRig quality={quality} />
    </Canvas>
  )
}
