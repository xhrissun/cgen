import { useState, useRef, useEffect } from 'react';

function EnhancedImageCropper({ imageSrc, onConfirm, onCancel, uploading, cropType = 'passport' }) {
  // cropType: 'passport' (300x450 for EODB ID) or 'profile' (300x300 for round profile)
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Crop dimensions based on type
  const CROP_DIMENSIONS = {
    passport: { width: 300, height: 450, label: 'EODB ID (2:3 Passport)' },
    profile: { width: 300, height: 300, label: 'Profile Photo (1:1 Round)' }
  };
  
  const { width: CROP_WIDTH, height: CROP_HEIGHT, label: CROP_LABEL } = 
    CROP_DIMENSIONS[cropType] || CROP_DIMENSIONS.passport;

  // Prevent page scroll when using wheel over crop area
  useEffect(() => {
    const preventScroll = (e) => {
      if (containerRef.current?.contains(e.target)) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('wheel', preventScroll, { passive: false });
    return () => document.removeEventListener('wheel', preventScroll);
  }, []);

  const handleImageLoad = () => {
    const img = imageRef.current;
    if (!img) return;

    setImageLoaded(true);
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });

    // Calculate initial zoom to fit image entirely within crop area
    const scale = Math.max(
      CROP_WIDTH / img.naturalWidth,
      CROP_HEIGHT / img.naturalHeight
    );

    setZoom(scale * 1.1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.00001;  // ✅ Changed from -0.001 to -0.0001 (10x smaller)
    const newZoom = Math.min(Math.max(0.1, zoom + delta), 5);
    setZoom(newZoom);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;

    if (!canvas || !img || !container || !imageLoaded) {
      alert('Image is still loading. Please wait.');
      return;
    }

    // Set canvas to exact crop dimensions
    canvas.width = CROP_WIDTH;
    canvas.height = CROP_HEIGHT;

    const ctx = canvas.getContext('2d');
    
    // Clear and fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP_WIDTH, CROP_HEIGHT);

    // Get container bounds
    const containerRect = container.getBoundingClientRect();
    
    // Get the actual img element position and size
    const imgRect = img.getBoundingClientRect();
    
    // Calculate the visible crop area (centered in container)
    const cropAreaLeft = (containerRect.width - CROP_WIDTH) / 2;
    const cropAreaTop = (containerRect.height - CROP_HEIGHT) / 2;

    // How much image is visible in the crop area (in screen pixels)
    const visibleImageLeft = Math.max(0, cropAreaLeft - (imgRect.left - containerRect.left));
    const visibleImageTop = Math.max(0, cropAreaTop - (imgRect.top - containerRect.top));

    // Scale from screen pixels to original image pixels
    const screenToOriginalX = imageDimensions.width / (imgRect.width || 1);
    const screenToOriginalY = imageDimensions.height / (imgRect.height || 1);

    // Source coordinates in the ORIGINAL image
    const sx = visibleImageLeft * screenToOriginalX;
    const sy = visibleImageTop * screenToOriginalY;
    const sWidth = CROP_WIDTH * screenToOriginalX;
    const sHeight = CROP_HEIGHT * screenToOriginalY;

    // Draw the cropped portion from source image to canvas
    ctx.drawImage(
      img,
      sx, sy, sWidth, sHeight,
      0, 0, CROP_WIDTH, CROP_HEIGHT
    );

    // Convert to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          console.log(`${CROP_LABEL} blob created:`, blob.size, 'bytes');
          onConfirm(blob, cropType);
        } else {
          alert('Failed to create cropped image. Please try again.');
        }
      },
      'image/jpeg',
      0.95
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-3xl w-full shadow-2xl">
        <h3 className="text-2xl font-bold mb-2 text-gray-800">
          Crop {CROP_LABEL}
        </h3>
        <p className="text-sm text-gray-600 mb-6">
          Drag to move • Scroll to zoom • <strong>Black border shows exact crop area</strong>
        </p>

        {/* Zoom Controls */}
        <div className="mb-5 bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Zoom Level</span>
            <span className="text-lg font-bold text-blue-600">{(zoom * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom(Math.max(0.1, zoom - 0.01))}
              className="px-4 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm font-bold"
            >
              −
            </button>
            <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${Math.min(100, ((zoom - 0.1) / 4.9) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setZoom(Math.min(5, zoom + 0.01))}
              className="px-4 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-sm font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Crop Container with BLACK BORDER to show EXACTLY what will be cropped */}
        <div className="mb-8 flex justify-center">
          <div
            ref={containerRef}
            className="relative"
            style={{
              width: `${CROP_WIDTH}px`,
              height: `${CROP_HEIGHT}px`,
              minHeight: '300px',
              border: '4px solid #000000',
              overflow: 'hidden',
              backgroundColor: '#000000',
              position: 'relative'
            }}
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
                <div className="text-white text-base animate-pulse">Loading image...</div>
              </div>
            )}

            {/* The image that moves and scales */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              onMouseDown={handleMouseDown}
              className="absolute select-none"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                maxWidth: 'none',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
            />

            {/* Guides overlay - shows what will be cropped */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Rule of thirds grid - subtle white lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="border border-white/25" />
                ))}
              </div>
              
              {/* Center crosshair for face alignment */}
              <div 
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '1px',
                  height: '24px',
                  backgroundColor: 'rgba(255,255,255,0.6)',
                }}
              />
              <div 
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '24px',
                  height: '1px',
                  backgroundColor: 'rgba(255,255,255,0.6)',
                }}
              />

              {/* Corner brackets */}
              <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-white" />
              <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-white" />
              <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-white" />
              <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-white" />

              {/* Dimensions label */}
              <div 
                className="absolute bottom-2 right-2 text-white text-xs bg-black/60 px-2 py-1 rounded"
              >
                {CROP_WIDTH}×{CROP_HEIGHT}px
              </div>
            </div>
          </div>
        </div>

        {/* Hidden canvas for final crop */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => {
              const img = imageRef.current;
              if (img) {
                const scale = Math.max(
                  CROP_WIDTH / imageDimensions.width,
                  CROP_HEIGHT / imageDimensions.height
                );
                setZoom(scale * 1.1);
                setPosition({ x: 0, y: 0 });
              }
            }}
            className="px-5 py-2 text-gray-600 hover:text-gray-800 font-medium hover:bg-gray-100 rounded-lg transition-colors"
            disabled={uploading}
          >
            ↺ Reset
          </button>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-8 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-medium transition-all"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={uploading || !imageLoaded}
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>✓ Crop & Upload</>
              )}
            </button>
          </div>
        </div>

        <div className="mt-5 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800 space-y-1">
          <div><strong>💡 Tips:</strong></div>
          <div>• The <strong>BLACK BORDER</strong> = exactly what will be saved</div>
          <div>• Center your face in the <strong>middle crosshair</strong></div>
          <div>• Use grid lines (rule of thirds) for composition</div>
          <div>• What you see in the black area = what you'll get</div>
        </div>
      </div>
    </div>
  );
}

export default EnhancedImageCropper;