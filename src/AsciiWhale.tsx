import React, { useState, useEffect, useMemo } from 'react';
import { Upload, Settings } from 'lucide-react';
import twLogo from '/whale-logo.png';

const AsciiWhale = () => {
  // State for the uploaded image and generated points
  const [points, setPoints] = useState<
    Array<{ x: number; y: number; z: number }>
  >([]);
  const [asciiFrame, setAsciiFrame] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  // Configuration that user can tweak if needed (could be UI controls later)
  const config = useMemo(
    () => ({
      sampleSize: 150, // Canvas size to analyze (higher = more resolution, slower)
      density: 2, // Skip pixels (higher = faster, less detail)
      depth: 15, // How "thick" the 3D extrusion is
      speed: 0.015, // Rotation speed (higher = faster rotation)
      charMap:
        ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
      bg: '#0066FF',
      color: '#FFFFFF',
    }),
    []
  );

  // 1. Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG or JPG).');
      return;
    }

    setError('');
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      processImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 2. Process Image into 3D Points
  const processImage = (imageSrc: string) => {
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      // Create a virtual canvas to read pixel data
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Maintain aspect ratio while fitting into sampleSize box
      let width = config.sampleSize;
      let height = config.sampleSize;
      const aspectRatio = img.width / img.height;

      if (img.width > img.height) {
        height = width / aspectRatio;
      } else {
        width = height * aspectRatio;
      }

      canvas.width = width;
      canvas.height = height;

      // Clear and Draw
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height).data;
      const newPoints: Array<{ x: number; y: number; z: number }> = [];
      const offsetX = width / 2;
      const offsetY = height / 2;

      // Scan pixels
      for (let y = 0; y < height; y += config.density) {
        for (let x = 0; x < width; x += config.density) {
          const i = (y * width + x) * 4;
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          // Threshold logic:
          // If it's a transparent PNG, use Alpha.
          // If it's a white-bg JPG, use Luminance (dark pixels = solid).
          // Use a brightness check. If pixel is NOT white (for logos), or Alpha is high.
          // For the whale logo (blue on white), we want the colored parts.
          const brightness = (r + g + b) / 3;

          // Valid point if it has opacity AND it's not pure white background
          // (Adjust this logic depending on your specific asset needs)
          const isValidPoint = a > 50 && brightness < 250;

          if (isValidPoint) {
            // Extrude Z
            const zStart = -config.depth / 2;
            const zEnd = config.depth / 2;
            // Create voxel column
            for (let z = zStart; z <= zEnd; z += 3) {
              newPoints.push({
                x: x - offsetX,
                y: -(y - offsetY), // Flip Y for 3D coords
                z: z,
              });
            }
          }
        }
      }

      setPoints(newPoints);
      setIsProcessing(false);
    };
  };

  // Load default image on mount
  useEffect(() => {
    processImage(twLogo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3. Render Loop (ASCII Projection)
  useEffect(() => {
    if (points.length === 0) return;

    let rotationY = 0;
    let frameId: number;

    const renderWidth = 100;
    const renderHeight = 50;
    const fov = 80;

    const zBuffer = new Float32Array(renderWidth * renderHeight);
    const charBuffer = new Array(renderWidth * renderHeight);

    const render = () => {
      zBuffer.fill(-Infinity);
      charBuffer.fill(' ');

      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      const tiltX = 0.2;
      const cosX = Math.cos(tiltX);
      const sinX = Math.sin(tiltX);

      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Rotate
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.z * cosY + p.x * sinY;
        const y1 = p.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + p.y * sinX;

        // Project
        // Adjust camera distance based on object scale (approx 1.5x width)
        const cameraDist = 150;
        const scale = fov / (cameraDist - z2);

        const xProjected = x1 * scale + renderWidth / 2;
        const yProjected = -y1 * scale * 0.55 + renderHeight / 2;

        const xp = Math.floor(xProjected);
        const yp = Math.floor(yProjected);

        if (xp >= 0 && xp < renderWidth && yp >= 0 && yp < renderHeight) {
          const idx = yp * renderWidth + xp;
          if (z2 > zBuffer[idx]) {
            zBuffer[idx] = z2;

            // Depth shading
            const depthNorm = (z2 + 30) / 60;
            const charIdx = Math.floor(depthNorm * config.charMap.length);
            const safeIdx = Math.max(
              0,
              Math.min(config.charMap.length - 1, charIdx)
            );
            charBuffer[idx] = config.charMap[safeIdx];
          }
        }
      }

      // Stringify
      let output = '';
      for (let y = 0; y < renderHeight; y++) {
        output +=
          charBuffer.slice(y * renderWidth, (y + 1) * renderWidth).join('') +
          '\n';
      }
      setAsciiFrame(output);

      rotationY += config.speed;
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [points, config]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-blue-600 font-sans select-none">
      {/* Render Area */}
      <div
        className="relative z-0 flex h-full w-full items-center justify-center"
        style={{
          backgroundColor: config.bg,
          color: config.color,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: '8px',
          lineHeight: '8px',
          fontWeight: 'bold',
          whiteSpace: 'pre',
          textAlign: 'center',
        }}
      >
        {points.length > 0 ? (
          asciiFrame
        ) : (
          <div className="text-center text-lg text-white/30">
            <p className="mb-4">Waiting for image...</p>
          </div>
        )}
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-10 z-10 flex flex-col items-center gap-4">
        {error && (
          <div className="mb-2 rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="group cursor-pointer">
          <div className="flex transform items-center gap-3 rounded-full border border-white/20 bg-white/10 px-6 py-3 shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:bg-white/20">
            {isProcessing ? (
              <Settings className="h-5 w-5 animate-spin text-white" />
            ) : (
              <Upload className="h-5 w-5 text-white" />
            )}
            <span className="text-sm font-medium text-white">
              {isProcessing ? 'Processing Pixels...' : 'Upload Logo (PNG/JPG)'}
            </span>
          </div>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isProcessing}
          />
        </label>

        <p className="max-w-xs text-center text-xs text-white/40">
          For best results, use a transparent PNG or a high-contrast logo on a
          white background.
        </p>
      </div>
    </div>
  );
};

export default AsciiWhale;
