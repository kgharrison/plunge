'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';

const ROTATION_KEY = 'plunge_device_rotation';

// Phone dimensions (iPhone 14 Pro proportions) - constant
const PHONE_WIDTH = 393;
const PHONE_HEIGHT = 852;
const BEZEL_PADDING = 24;

// ============================================
// Global state that persists across navigations
// ============================================
interface FrameState {
  mounted: boolean;
  scale: number;
  isRotated: boolean;
  isMobile: boolean;
}

let globalState: FrameState = {
  mounted: false,
  scale: 1,
  isRotated: false,
  isMobile: false,
};

const serverState: FrameState = {
  mounted: false,
  scale: 1,
  isRotated: false,
  isMobile: false,
};

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FrameState {
  return globalState;
}

function getServerSnapshot(): FrameState {
  return serverState;
}

// Export hook for other components to read rotation state
export function useDeviceRotation(): boolean {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return state.isRotated;
}

function updateGlobalState(updates: Partial<FrameState>) {
  globalState = { ...globalState, ...updates };
  notifyListeners();
}

// Calculate scale - pure function
function calculateScaleForRotation(rotated: boolean): number {
  if (typeof window === 'undefined') return 1;
  
  const headerHeight = 60;
  const footerHeight = 40;
  const verticalPadding = headerHeight + footerHeight + 32;
  const horizontalPadding = 64;
  
  const availableWidth = window.innerWidth - horizontalPadding;
  const availableHeight = window.innerHeight - verticalPadding;
  
  const frameWidth = rotated ? PHONE_HEIGHT : PHONE_WIDTH;
  const frameHeight = rotated ? PHONE_WIDTH : PHONE_HEIGHT;
  const totalWidth = frameWidth + BEZEL_PADDING;
  const totalHeight = frameHeight + BEZEL_PADDING;
  
  const scaleX = availableWidth / totalWidth;
  const scaleY = availableHeight / totalHeight;
  
  return Math.min(Math.min(scaleX, scaleY), 1);
}

// Initialize global state (runs once)
if (typeof window !== 'undefined' && !globalState.mounted) {
  const isRotated = localStorage.getItem(ROTATION_KEY) === 'true';
  const isMobile = window.innerWidth < 768;
  const scale = calculateScaleForRotation(isRotated);
  
  globalState = {
    mounted: true,
    scale,
    isRotated,
    isMobile,
  };
  
  // Listen for resize
  window.addEventListener('resize', () => {
    const newIsMobile = window.innerWidth < 768;
    const newScale = calculateScaleForRotation(globalState.isRotated);
    if (newIsMobile !== globalState.isMobile || newScale !== globalState.scale) {
      updateGlobalState({ isMobile: newIsMobile, scale: newScale });
    }
  });
}

// ============================================
// Component
// ============================================
interface DeviceFrameProps {
  children: React.ReactNode;
}

export default function DemoDeviceFrame({ children }: DeviceFrameProps) {
  // Use global state that persists across navigations
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { mounted, scale, isRotated, isMobile } = state;
  
  const [isCapturing, setIsCapturing] = useState(false);
  
  // Touch indicator state
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [isInScreen, setIsInScreen] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  
  const deviceFrameRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  // Frame dimensions based on rotation
  const frameWidth = isRotated ? PHONE_HEIGHT : PHONE_WIDTH;
  const frameHeight = isRotated ? PHONE_WIDTH : PHONE_HEIGHT;
  const totalWidth = frameWidth + BEZEL_PADDING;
  const totalHeight = frameHeight + BEZEL_PADDING;

  // Toggle rotation
  const toggleRotation = useCallback(() => {
    const newRotation = !globalState.isRotated;
    localStorage.setItem(ROTATION_KEY, String(newRotation));
    const newScale = calculateScaleForRotation(newRotation);
    updateGlobalState({ isRotated: newRotation, scale: newScale });
  }, []);

  // Capture screenshot
  const captureScreenshot = useCallback(async () => {
    if (!deviceFrameRef.current || !screenRef.current || isCapturing) return;
    
    setIsCapturing(true);
    try {
      const { domToPng } = await import('modern-screenshot');
      
      const element = deviceFrameRef.current;
      const originalTransform = element.style.transform;
      const originalPosition = element.style.position;
      const originalTop = element.style.top;
      const originalLeft = element.style.left;
      
      element.style.transform = 'none';
      element.style.position = 'fixed';
      element.style.top = '0';
      element.style.left = '0';
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        const dataUrl = await domToPng(element, {
          scale: 2,
          backgroundColor: null,
          width: totalWidth,
          height: totalHeight,
        });
        
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `plunge-device-${isRotated ? 'landscape' : 'portrait'}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } finally {
        element.style.transform = originalTransform;
        element.style.position = originalPosition;
        element.style.top = originalTop;
        element.style.left = originalLeft;
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [isRotated, isCapturing, totalWidth, totalHeight]);

  // Touch indicator and drag-to-scroll for the screen area
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragScrollRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  useEffect(() => {
    const screen = screenRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!screen || !scrollContainer || isMobile) return;

    const getScaledPosition = (e: MouseEvent) => {
      const rect = screen.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const pos = getScaledPosition(e);
      setTouchPos(pos);
      
      // Handle drag-to-scroll
      if (dragScrollRef.current) {
        const deltaX = (e.clientX - dragScrollRef.current.startX) / scale;
        const deltaY = (e.clientY - dragScrollRef.current.startY) / scale;
        scrollContainer.scrollLeft = dragScrollRef.current.scrollLeft - deltaX;
        scrollContainer.scrollTop = dragScrollRef.current.scrollTop - deltaY;
      }
    };

    const handleMouseEnter = () => setIsInScreen(true);
    const handleMouseLeave = () => {
      setIsInScreen(false);
      setIsPressed(false);
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      setIsPressed(true);
      // Start drag-to-scroll
      dragScrollRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
      };
    };
    
    const handleMouseUp = () => {
      setIsPressed(false);
      dragScrollRef.current = null;
    };

    screen.addEventListener('mousemove', handleMouseMove);
    screen.addEventListener('mouseenter', handleMouseEnter);
    screen.addEventListener('mouseleave', handleMouseLeave);
    screen.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      screen.removeEventListener('mousemove', handleMouseMove);
      screen.removeEventListener('mouseenter', handleMouseEnter);
      screen.removeEventListener('mouseleave', handleMouseLeave);
      screen.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [scale, isMobile]);

  // On mobile (after mount confirmed), render children directly without frame
  if (mounted && isMobile) {
    return <>{children}</>;
  }

  // For desktop: always render frame structure
  // During SSR/hydration (mounted=false), hide with opacity to avoid flash
  // This keeps DOM structure identical between server and client
  const isVisible = mounted;
  

  return (
    <div 
      className="h-screen bg-[#1a1a1a] flex flex-col items-center justify-between py-4 overflow-hidden"
      style={{ 
        opacity: isVisible ? 1 : 0,
        transition: 'none', // No transition to avoid any animation
      }}
    >
      {/* Header with rotate and screenshot buttons */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <button
          onClick={toggleRotation}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-white/70 hover:text-white/90"
          title={isRotated ? 'Portrait mode' : 'Landscape mode'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${isRotated ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span className="text-xs font-medium">
            {isRotated ? 'Portrait' : 'Landscape'}
          </span>
        </button>
        <button
          onClick={captureScreenshot}
          disabled={isCapturing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors text-white/70 hover:text-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Capture screenshot"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-xs font-medium">
            {isCapturing ? 'Capturing...' : 'Screenshot'}
          </span>
        </button>
      </div>

      {/* Phone frame with scaling */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          ref={deviceFrameRef}
          className="relative origin-center"
          style={{
            width: totalWidth,
            height: totalHeight,
            transform: `scale(${scale})`,
            flexShrink: 0,
          }}
        >
          {/* Phone bezel */}
          <div
            className="absolute inset-0 rounded-[48px] bg-[#2a2a2a] shadow-2xl"
            style={{
              boxShadow: `
                0 0 0 1px rgba(255,255,255,0.1),
                0 25px 50px -12px rgba(0,0,0,0.5),
                inset 0 1px 0 rgba(255,255,255,0.05)
              `,
            }}
          />
          
          {/* Screen area */}
          <div
            ref={screenRef}
            className="absolute rounded-[40px] overflow-hidden"
            style={{
              top: 12,
              left: 12,
              width: frameWidth,
              height: frameHeight,
              contain: 'layout paint',
              isolation: 'isolate',
              transform: 'translateZ(0)',
              cursor: 'none',
            }}
          >
            {/* Content wrapper with cursor hidden and drag-to-scroll */}
            <div
              ref={scrollContainerRef}
              className="relative bg-black [&_*]:!cursor-none"
              style={{
                width: frameWidth,
                height: frameHeight,
                overflow: 'auto',
                cursor: 'none',
              }}
            >
              {children}
            </div>
            
            {/* Touch indicator circle - rendered outside content scroll area */}
            <div
              style={{
                position: 'absolute',
                left: touchPos.x,
                top: touchPos.y,
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: isPressed 
                  ? 'radial-gradient(circle, rgba(0,210,211,0.6) 0%, rgba(0,210,211,0.3) 50%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(0,210,211,0.4) 0%, rgba(0,210,211,0.2) 50%, transparent 70%)',
                border: isPressed ? '2px solid rgba(0,210,211,1)' : '2px solid rgba(0,210,211,0.6)',
                boxShadow: isPressed ? '0 0 20px rgba(0,210,211,0.6)' : '0 0 10px rgba(0,210,211,0.3)',
                transform: `translate(-50%, -50%) scale(${isPressed ? 0.85 : 1})`,
                pointerEvents: 'none',
                zIndex: 9999,
                transition: 'transform 0.1s ease-out, background 0.1s ease-out, border-color 0.1s ease-out, box-shadow 0.1s ease-out',
                opacity: isInScreen ? 1 : 0,
              }}
            />
          </div>
          
          {/* Side button (power) */}
          <div
            className="absolute bg-[#3a3a3a] rounded-sm"
            style={{
              width: 3,
              height: 60,
              right: -1,
              top: isRotated ? '50%' : 180,
              transform: isRotated ? 'translateY(-50%)' : 'none',
            }}
          />
          
          {/* Volume buttons */}
          <div
            className="absolute bg-[#3a3a3a] rounded-sm"
            style={{
              width: 3,
              height: 35,
              left: -1,
              top: isRotated ? '35%' : 150,
            }}
          />
          <div
            className="absolute bg-[#3a3a3a] rounded-sm"
            style={{
              width: 3,
              height: 35,
              left: -1,
              top: isRotated ? '50%' : 195,
            }}
          />
        </div>
      </div>

    </div>
  );
}
