"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import "react-easy-crop/react-easy-crop.css";
import "@/public/styles/admin/image-crop.scss";

export interface CropStageConfig {
  key: string;
  aspect: number;
  outputWidth: number;
  title: string;
  hint: string;
  fileSuffix: string;
}

export interface CroppedImageResult {
  stage: string;
  file: File;
}

interface ImageCropModalProps {
  imageSrc: string;
  fileName: string;
  stages: CropStageConfig[];
  onClose: () => void;
  onComplete: (results: CroppedImageResult[]) => void | Promise<void>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

async function cropImageToBlob(
  src: string,
  crop: Area,
  outputWidth: number,
  aspect: number,
): Promise<Blob> {
  const image = await loadImage(src);
  const outputHeight = Math.max(1, Math.round(outputWidth / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("이미지를 처리할 수 없습니다.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("이미지를 처리할 수 없습니다."));
      }
    }, "image/png");
  });
}

export function ImageCropModal({
  imageSrc,
  fileName,
  stages,
  onClose,
  onComplete,
}: ImageCropModalProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] =
    useState<Area | null>(null);
  const [results, setResults] = useState<CroppedImageResult[]>([]);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage = stages[stageIndex];
  const isLastStage = stageIndex >= stages.length - 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !cropping) {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [cropping, onClose]);

  const applyCrop = async () => {
    if (!croppedAreaPixels || cropping) return;

    setCropping(true);
    setError(null);
    try {
      const blob = await cropImageToBlob(
        imageSrc,
        croppedAreaPixels,
        stage.outputWidth,
        stage.aspect,
      );
      const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
      const croppedFile = new File(
        [blob],
        `${baseName}-${stage.fileSuffix}.png`,
        { type: "image/png" },
      );
      const nextResults = [
        ...results,
        { stage: stage.key, file: croppedFile },
      ];

      if (!isLastStage) {
        setResults(nextResults);
        setStageIndex(stageIndex + 1);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        return;
      }

      await onComplete(nextResults);
    } catch (reason) {
      console.error(reason);
      setError(
        reason instanceof Error
          ? reason.message
          : "이미지를 자르지 못했습니다.",
      );
    } finally {
      setCropping(false);
    }
  };

  return (
    <div
      className="admin-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !cropping) {
          onClose();
        }
      }}
    >
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={stage.title}
      >
        <header className="admin-modal-header">
          <h2>{stage.title}</h2>
          <button
            type="button"
            className="admin-modal-close"
            onClick={onClose}
            aria-label="닫기"
            disabled={cropping}
          >
            ×
          </button>
        </header>

        <div className="admin-modal-body">
          <div className="admin-crop">
            <div className="admin-crop-viewport">
              <Cropper
                key={stage.key}
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={stage.aspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) =>
                  setCroppedAreaPixels(areaPixels)
                }
                showGrid
              />
            </div>
            <label className="admin-field">
              <span>확대 / 축소</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(event) =>
                  setZoom(Number(event.target.value))
                }
              />
            </label>
            <p className="admin-crop-hint">{stage.hint}</p>
            {stages.length > 1 ? (
              <p className="admin-crop-hint">
                단계 {stageIndex + 1} / {stages.length}
              </p>
            ) : null}
            {error ? <p className="admin-crop-error">{error}</p> : null}
          </div>
        </div>

        <footer className="admin-modal-footer">
          <button
            type="button"
            className="admin-button"
            onClick={onClose}
            disabled={cropping}
          >
            취소
          </button>
          <button
            type="button"
            className="admin-button primary"
            onClick={() => void applyCrop()}
            disabled={cropping || !croppedAreaPixels}
          >
            {cropping
              ? "처리 중..."
              : isLastStage
                ? "적용"
                : "다음"}
          </button>
        </footer>
      </div>
    </div>
  );
}
