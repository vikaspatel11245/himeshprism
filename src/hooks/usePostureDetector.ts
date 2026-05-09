import { useEffect, useRef, useState, useCallback } from "react";
import { FilesetResolver, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import { Camera } from "@mediapipe/camera_utils";
import { runAnalysis, Landmark } from "../lib/postureEngine";

const VIEWS = ["FRONT", "RIGHT", "BACK", "LEFT"];
const PREP_S = 3;
const CAP_S = 5;

export function usePostureDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  const [isActive, setIsActive] = useState(false);
  const [backendState, setBackendState] = useState<"idle" | "prep" | "capturing" | "done">("idle");
  const [viewIdx, setViewIdx] = useState(0);
  const [prepRem, setPrepRem] = useState(0);
  const [capRem, setCapRem] = useState(0);
  const [capProg, setCapProg] = useState(0);
  const [completedViews, setCompletedViews] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(false);

  // State refs for the animation loop
  const stateRef = useRef({
    state: "idle" as "idle" | "prep" | "capturing" | "done",
    viewIdx: 0,
    phaseStart: 0,
    captured: {} as Record<string, Landmark[][]>,
    liveFrames: [] as Landmark[][],
    isPaused: false,
    pauseStart: 0,
  });

  useEffect(() => {
    stateRef.current.state = backendState;
    stateRef.current.viewIdx = viewIdx;
    stateRef.current.isPaused = isPaused;
  }, [backendState, viewIdx, isPaused]);

  useEffect(() => {
    async function init() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    }
    init();
  }, []);

  const tick = useCallback((landmarks: any) => {
    const sRef = stateRef.current;
    if (sRef.isPaused) return;

    const now = performance.now() / 1000;
    
    if (sRef.state === "prep") {
      const el = now - sRef.phaseStart;
      setPrepRem(Math.max(0, Math.ceil(PREP_S - el)));
      if (el >= PREP_S) {
        sRef.state = "capturing";
        sRef.phaseStart = now;
        sRef.liveFrames = [];
        setBackendState("capturing");
      }
    } else if (sRef.state === "capturing") {
      const el = now - sRef.phaseStart;
      setCapRem(Math.max(0, Math.ceil(CAP_S - el)));
      setCapProg(Math.min(1.0, el / CAP_S));
      
      if (landmarks) {
        sRef.liveFrames.push(landmarks);
      }
      
      if (el >= CAP_S) {
        const vid = VIEWS[sRef.viewIdx];
        sRef.captured[vid] = [...sRef.liveFrames];
        setCompletedViews(Object.keys(sRef.captured));
        
        sRef.viewIdx += 1;
        setViewIdx(sRef.viewIdx);
        
        if (sRef.viewIdx >= VIEWS.length) {
          sRef.state = "done";
          setBackendState("done");
          const finalRes = runAnalysis(sRef.captured);
          setResults(finalRes);
        } else {
          sRef.state = "prep";
          sRef.phaseStart = now;
          sRef.liveFrames = [];
          setBackendState("prep");
        }
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !landmarkerRef.current) return;
    
    setIsActive(true);
    setBackendState("idle");
    setResults(null);
    setCompletedViews([]);
    setViewIdx(0);
    stateRef.current.captured = {};
    
    const canvasCtx = canvasRef.current.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx!);

    let lastVideoTime = -1;

    cameraRef.current = new Camera(videoRef.current, {
      onFrame: async () => {
        if (!videoRef.current || !canvasRef.current || !landmarkerRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        let startTimeMs = performance.now();
        if (lastVideoTime !== video.currentTime) {
          lastVideoTime = video.currentTime;
          
          const result = landmarkerRef.current.detectForVideo(video, startTimeMs);
          
          canvasCtx?.save();
          canvasCtx?.clearRect(0, 0, canvas.width, canvas.height);
          canvasCtx?.translate(canvas.width, 0);
          canvasCtx?.scale(-1, 1);
          canvasCtx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          if (result.landmarks && result.landmarks.length > 0) {
            const lms = result.landmarks[0];
            tick(lms);
            
            drawingUtils.drawConnectors(lms, PoseLandmarker.POSE_CONNECTIONS, {
              color: "#38bdf8",
              lineWidth: 4
            });
            drawingUtils.drawLandmarks(lms, {
              color: "#0f172a",
              lineWidth: 2,
              fillColor: "#38bdf8",
              radius: 4
            });
          } else {
            tick(null);
          }
          canvasCtx?.restore();
        }
      },
      width: 640,
      height: 480
    });
    
    await cameraRef.current.start();
  }, [tick]);

  const stopCamera = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop();
    }
    setIsActive(false);
    setBackendState("idle");
    stateRef.current.state = "idle";
  }, []);

  const startAnalysis = useCallback(() => {
    setBackendState("prep");
    setViewIdx(0);
    setCompletedViews([]);
    setResults(null);
    stateRef.current.state = "prep";
    stateRef.current.viewIdx = 0;
    stateRef.current.phaseStart = performance.now() / 1000;
    stateRef.current.captured = {};
    stateRef.current.liveFrames = [];
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused(p => {
      const newPaused = !p;
      if (newPaused) {
        stateRef.current.pauseStart = performance.now() / 1000;
      } else {
        const pauseDur = (performance.now() / 1000) - stateRef.current.pauseStart;
        stateRef.current.phaseStart += pauseDur;
      }
      return newPaused;
    });
  }, []);

  const resetAnalysis = useCallback(() => {
    setBackendState("idle");
    setViewIdx(0);
    setCompletedViews([]);
    setResults(null);
    stateRef.current.state = "idle";
    stateRef.current.viewIdx = 0;
    stateRef.current.captured = {};
  }, []);

  return {
    videoRef,
    canvasRef,
    isActive,
    backendState,
    viewInfo: { id: VIEWS[viewIdx] },
    completedViews,
    prepRem,
    capRem,
    capProg,
    results,
    isPaused,
    startCamera,
    stopCamera,
    startAnalysis,
    togglePause,
    resetAnalysis,
    allViewsDone: backendState === "done"
  };
}
