import { useEffect, useRef, useState, useCallback } from "react";
import { FilesetResolver, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import { Camera } from "@mediapipe/camera_utils";
import { createTracker, ExerciseBase, YogaBase, Landmark } from "../lib/exerciseEngine";

export function useExerciseTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  
  const [cameraOn, setCameraOn] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [currentEx, setCurrentEx] = useState("squats");
  
  // Stats
  const [stats, setStats] = useState<any>({});
  
  const trackerRef = useRef<ExerciseBase | YogaBase | null>(null);

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
    if (!tracking || !trackerRef.current || !canvasRef.current) return;
    
    if (landmarks) {
      trackerRef.current.process(landmarks, canvasRef.current.width, canvasRef.current.height);
    }
    
    const t = trackerRef.current;
    if (t.is_yoga) {
      const ty = t as YogaBase;
      setStats({
        is_yoga: true,
        hold_elapsed: ty.currentHold(),
        hold_target: ty.hold_target,
        in_pose: ty.in_pose,
        reps: ty.reps,
        form_score: ty.form_score,
        feedback: ty.feedback
      });
    } else {
      const tp = t as ExerciseBase;
      setStats({
        is_yoga: false,
        reps: tp.reps,
        angle: tp.angle ? Math.round(tp.angle) : 0,
        speed_msg: tp.speed_msg,
        speed_status: tp.speed_status,
        avg_rep_time: tp.avg_rep_time,
        form_score: tp.form_score,
        feedback: tp.feedback
      });
    }
  }, [tracking]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !landmarkerRef.current) return;
    
    setCameraOn(true);
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
              color: "#f43f5e",
              lineWidth: 4
            });
            drawingUtils.drawLandmarks(lms, {
              color: "#0f172a",
              lineWidth: 2,
              fillColor: "#f43f5e",
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
    setCameraOn(false);
    setTracking(false);
  }, []);

  const startExercise = useCallback((exId: string) => {
    setCurrentEx(exId);
    trackerRef.current = createTracker(exId);
    setTracking(true);
  }, []);

  const stopExercise = useCallback(() => {
    setTracking(false);
    trackerRef.current = null;
  }, []);

  const resetExercise = useCallback(() => {
    if (currentEx) {
      trackerRef.current = createTracker(currentEx);
    }
  }, [currentEx]);

  return {
    videoRef,
    canvasRef,
    cameraOn,
    tracking,
    currentEx,
    stats,
    startCamera,
    stopCamera,
    startExercise,
    stopExercise,
    resetExercise,
    setCurrentEx
  };
}
