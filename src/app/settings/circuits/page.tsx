'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { loadCache, saveCache, isCacheStale } from '@/lib/settings-cache';

interface CircuitDefinition {
  circuitId: number;
  name: string;
  nameIndex: number;
  function: number;
  interface: number;
  freeze: boolean;
  colorSet: number;
  colorPos: number;
  colorStagger: number;
  eggTimer: number;
}

interface PumpCircuit {
  circuitId: number;
  speed: number;
  isRPM: boolean;
}

interface BuiltInName {
  id: number;
  name: string;
}

// Pentair predefined circuit names with their actual nameIndex values
// These indices are from the ScreenLogic system (verified against actual hardware)
// Custom names start at index 92+ (indices 92-111 map to custom slots 0-19)
// Note: The indices don't match the documentation numbering - they use internal system indices
const BUILT_IN_NAMES: BuiltInName[] = [
  { id: 1, name: 'Aerator' },
  { id: 2, name: 'Air Blower' },
  { id: 3, name: 'Aux 1' },
  { id: 4, name: 'Aux 2' },
  { id: 5, name: 'Aux 3' },
  { id: 6, name: 'Aux 4' },
  { id: 7, name: 'Aux 5' },
  { id: 8, name: 'Aux 6' },
  { id: 9, name: 'Aux 7' },
  { id: 10, name: 'Aux 8' },
  { id: 11, name: 'Aux 9' },
  { id: 12, name: 'Aux 10' },
  { id: 13, name: 'Backwash' },
  { id: 14, name: 'Back Light' },
  { id: 15, name: 'BBQ Light' },
  { id: 16, name: 'Beach Light' },
  { id: 17, name: 'Bench' },
  { id: 18, name: 'Blower' },
  { id: 19, name: 'Booster Pump' },
  { id: 20, name: 'Bug Light' },
  { id: 21, name: 'Cabana Lts' },
  { id: 22, name: 'Chem. Feeder' },
  { id: 23, name: 'Chlorinator' },
  { id: 24, name: 'Cleaner' },
  { id: 25, name: 'Color Wheel' },
  { id: 26, name: 'Deck Light' },
  { id: 27, name: 'Drain Line' },
  { id: 28, name: 'Drive Light' },
  { id: 29, name: 'Edge Pump' },
  { id: 30, name: 'Entry Light' },
  { id: 31, name: 'Fan' },
  { id: 32, name: 'Fiber Optic' },
  { id: 33, name: 'Fiberworks' },
  { id: 34, name: 'Fill Line' },
  { id: 35, name: 'Floor Clnr' },
  { id: 36, name: 'Fogger' },
  { id: 37, name: 'Fountain' },
  { id: 38, name: 'Fountain 1' },
  { id: 39, name: 'Fountain 2' },
  { id: 40, name: 'Fountain 3' },
  { id: 41, name: 'Fountains' },
  { id: 42, name: 'Front Light' },
  { id: 43, name: 'High Speed' },      // Verified: nameIndex=43
  { id: 44, name: 'High Temp' },
  { id: 45, name: 'House Light' },
  { id: 46, name: 'Jets' },            // Verified: nameIndex=46
  { id: 47, name: 'Lights' },          // Verified: nameIndex=47
  { id: 48, name: 'Low Speed' },
  { id: 49, name: 'Low Temp' },
  { id: 50, name: 'Malibu Lts' },
  { id: 51, name: 'Mist' },
  { id: 52, name: 'Motor Valve' },
  { id: 53, name: 'Music' },
  { id: 54, name: 'NOT USED' },
  { id: 55, name: 'Ozonator' },
  { id: 56, name: 'Path Lights' },
  { id: 57, name: 'Patio Lts' },
  { id: 58, name: 'Perimeter L' },
  { id: 59, name: 'PG2000' },
  { id: 60, name: 'Pond Light' },
  { id: 61, name: 'Pool' },            // Verified: nameIndex=61
  { id: 62, name: 'Pool High' },
  { id: 63, name: 'Pool Light' },
  { id: 64, name: 'Pool Low' },
  { id: 65, name: 'Pool SAM' },
  { id: 66, name: 'Pool SAM 1' },
  { id: 67, name: 'Pool SAM 2' },
  { id: 68, name: 'Pool SAM 3' },
  { id: 69, name: 'Security Lt' },
  { id: 70, name: 'Slide' },
  { id: 71, name: 'Solar' },
  { id: 72, name: 'Spa' },             // Verified: nameIndex=72
  { id: 73, name: 'Spa High' },
  { id: 74, name: 'Spa Light' },
  { id: 75, name: 'Spa Low' },
  { id: 76, name: 'Spa SAL' },
  { id: 77, name: 'Spa SAM' },
  { id: 78, name: 'Spa Wtrfll' },
  { id: 79, name: 'Spillway' },
  { id: 80, name: 'Sprinklers' },
  { id: 81, name: 'Stream' },
  { id: 82, name: 'Statue Lt' },
  { id: 83, name: 'Swim Jets' },
  { id: 84, name: 'Wtr Feature' },
  { id: 85, name: 'Wtr Feat Lt' },
  { id: 86, name: 'Waterfall' },       // Verified: nameIndex=86
  { id: 87, name: 'Waterfall 1' },
  { id: 88, name: 'Waterfall 2' },
  { id: 89, name: 'Waterfall 3' },
  { id: 90, name: 'Whirlpool' },
  { id: 91, name: 'Wtrfl Lght' },      // Note: "Waterfall Light" uses this index but shows custom name
];

interface Credentials {
  systemName: string;
  password: string;
}

const CREDENTIALS_KEY = 'plunge_credentials';

function loadCredentials(): Credentials | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(CREDENTIALS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function getAuthHeaders(credentials: Credentials | null): HeadersInit {
  if (!credentials) return {};
  return {
    'X-Pool-System-Name': credentials.systemName,
    'X-Pool-Password': credentials.password,
  };
}

// Circuit function types
const CIRCUIT_FUNCTIONS: { id: number; name: string }[] = [
  { id: 0, name: 'Generic' },
  { id: 1, name: 'Spa' },
  { id: 2, name: 'Pool' },
  { id: 5, name: 'Master Cleaner' },
  { id: 7, name: 'Light' },
  { id: 9, name: 'SAM Light' },
  { id: 10, name: 'SAL Light' },
  { id: 11, name: 'Photon Gen' },
  { id: 12, name: 'Color Wheel' },
  { id: 13, name: 'Valve' },
  { id: 14, name: 'Spillway' },
  { id: 15, name: 'Floor Cleaner' },
  { id: 16, name: 'IntelliBrite' },
  { id: 17, name: 'MagicStream' },
  { id: 19, name: 'Not Used' },
];

// Circuit interface types
const CIRCUIT_INTERFACES: { id: number; name: string }[] = [
  { id: 0, name: 'Pool' },
  { id: 1, name: 'Spa' },
  { id: 2, name: 'Feature' },
  { id: 3, name: 'Light' },
  { id: 4, name: 'Valve' },
  { id: 5, name: 'Heater' },
];

// Check if a function is a light type
function isLightFunction(func: number): boolean {
  return [7, 9, 10, 11, 12, 16, 17].includes(func);
}

export default function CircuitsSettingsPage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [circuits, setCircuits] = useState<CircuitDefinition[]>([]);
  const [pumpCircuits, setPumpCircuits] = useState<PumpCircuit[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Editor state
  const [editingCircuit, setEditingCircuit] = useState<CircuitDefinition | null>(null);
  const [formName, setFormName] = useState('');
  const [formNameIndex, setFormNameIndex] = useState(0);
  const [formFunction, setFormFunction] = useState(0);
  const [formInterface, setFormInterface] = useState(0);
  const [formFreeze, setFormFreeze] = useState(false);
  const [formColorPos, setFormColorPos] = useState(0);
  const [useCustomName, setUseCustomName] = useState(false);
  const [customNameIndex, setCustomNameIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  
  // Drag to dismiss
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const rect = target.closest('.modal-sheet')?.getBoundingClientRect();
    if (rect && touch.clientY - rect.top < 50) {
      isDragging.current = true;
      dragStartY.current = touch.clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const touch = e.touches[0];
    const delta = touch.clientY - dragStartY.current;
    if (delta > 0) {
      setSheetTranslateY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (sheetTranslateY > 100) {
      closeEditor();
    }
    setSheetTranslateY(0);
  };

  useEffect(() => {
    setCredentials(loadCredentials());
    
    // Load cached data immediately
    const cache = loadCache();
    if (cache) {
      if (cache.config) {
        const config = cache.config as { controller?: { circuitArray?: CircuitDefinition[] } };
        setCircuits(config.controller?.circuitArray || []);
      }
      if (cache.pump) {
        const pump = cache.pump as { pumpCircuits?: PumpCircuit[] };
        setPumpCircuits(pump.pumpCircuits || []);
      }
      if (!isCacheStale()) {
        setLoading(false);
      }
    }
  }, []);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!credentials) return;
    
    if (showLoading) setLoading(true);
    try {
      // Fetch config and custom names in parallel
      const [configRes, namesRes] = await Promise.all([
        fetch('/api/config', { headers: getAuthHeaders(credentials) }),
        fetch('/api/config/circuit-names', { headers: getAuthHeaders(credentials) }),
      ]);
      
      if (!configRes.ok) throw new Error('Failed to fetch config');
      
      const config = await configRes.json();
      setCircuits(config.controller.circuitArray || []);
      
      // Extract pump circuits from equipment config
      const equipPumps = config.equipment?.pumps;
      if (equipPumps && equipPumps.length > 0) {
        const equipPump = equipPumps[0];
        if (equipPump?.circuits) {
          const pumpCircs = equipPump.circuits
            .filter((c: { circuit: number }) => c.circuit > 0 && c.circuit < 100)
            .map((c: { circuit: number; speed: number; units: number }) => ({
              circuitId: c.circuit,
              speed: c.speed,
              isRPM: c.units === 0,
            }));
          setPumpCircuits(pumpCircs);
        }
      }
      
      // Load custom names
      if (namesRes.ok) {
        const names = await namesRes.json();
        setCustomNames(names.custom || []);
      }
      
      // Update cache
      saveCache({ config });
      
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => {
    if (credentials) {
      const cache = loadCache();
      const hasCache = cache && cache.config;
      fetchData(!hasCache || isCacheStale());
    }
  }, [credentials, fetchData]);

  const getFunctionName = (func: number): string => {
    return CIRCUIT_FUNCTIONS.find(f => f.id === func)?.name || `Function ${func}`;
  };

  const getInterfaceName = (iface: number): string => {
    return CIRCUIT_INTERFACES.find(i => i.id === iface)?.name || `Interface ${iface}`;
  };

  const getPumpSpeed = (circuitId: number): string | null => {
    const pc = pumpCircuits.find(p => p.circuitId === circuitId);
    if (!pc) return null;
    return `${pc.speed} ${pc.isRPM ? 'RPM' : 'GPM'}`;
  };

  const openEditor = (circuit: CircuitDefinition) => {
    setEditingCircuit(circuit);
    setFormName(circuit.name);
    setFormFunction(circuit.function);
    setFormInterface(circuit.interface);
    setFormFreeze(circuit.freeze);
    setFormColorPos(circuit.colorPos);
    
    // Check if using custom name:
    // 1. nameIndex >= 92 indicates explicit custom name slot
    // 2. nameIndex < 92 but not in our built-in list - treat as custom for better UX
    const isExplicitCustom = circuit.nameIndex >= 92;
    const builtInMatch = BUILT_IN_NAMES.find(n => n.id === circuit.nameIndex);
    const shouldUseCustom = isExplicitCustom || !builtInMatch;
    
    setUseCustomName(shouldUseCustom);
    
    if (isExplicitCustom) {
      // Explicit custom name slot (92-111)
      setCustomNameIndex(circuit.nameIndex - 92);
      setFormNameIndex(circuit.nameIndex);
    } else if (!builtInMatch) {
      // Name not in our built-in list - default to custom mode with available slot
      const slot = findAvailableCustomSlot();
      setCustomNameIndex(slot);
      setFormNameIndex(circuit.nameIndex);
    } else {
      // Found in built-in list
      setFormNameIndex(circuit.nameIndex);
    }
  };

  const closeEditor = () => {
    setEditingCircuit(null);
  };

  const saveCircuit = async () => {
    if (!credentials || !editingCircuit) return;
    
    setSaving(true);
    try {
      let finalNameIndex = formNameIndex;
      
      // If using custom name, save the custom name first
      if (useCustomName) {
        // Save custom name
        await fetch('/api/config/circuit-names', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
          body: JSON.stringify({ index: customNameIndex, name: formName.slice(0, 11) }),
        });
        // Custom name index is 92 + slot
        finalNameIndex = 92 + customNameIndex;
      }
      
      // Save circuit config
      await fetch(`/api/config/circuit/${editingCircuit.circuitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(credentials) },
        body: JSON.stringify({
          nameIndex: finalNameIndex,
          function: formFunction,
          interface: formInterface,
          freeze: formFreeze,
          colorPos: formColorPos,
        }),
      });
      
      closeEditor();
      fetchData(false);
    } catch (err) {
      console.error('Failed to save circuit:', err);
    } finally {
      setSaving(false);
    }
  };

  // Find an available custom name slot
  const findAvailableCustomSlot = (): number => {
    // Find a slot that's not in use by any circuit
    const usedSlots = circuits
      .filter(c => c.nameIndex >= 92 && c.nameIndex < 112)
      .map(c => c.nameIndex - 92);
    
    for (let i = 0; i < 20; i++) {
      if (!usedSlots.includes(i) || (editingCircuit && editingCircuit.nameIndex === 92 + i)) {
        return i;
      }
    }
    return 0; // Fallback to first slot
  };

  return (
    <>
      <div className="relative z-10 max-w-[430px] mx-auto px-4 pt-3 pb-24 min-h-dvh">
        {/* Header */}
        <header className="flex items-center gap-3 py-2 mb-4">
          <Link href="/settings" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </Link>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight leading-none">Circuits</h1>
            <p className="text-[14px] text-white/50 mt-0.5">{circuits.filter(c => c.circuitId > 0).length} configured</p>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <div className="text-white/40">Loading circuits...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center pt-32 gap-4">
            <div className="text-white/40">{error}</div>
            <button onClick={() => fetchData()} className="px-4 py-2 bg-white/10 rounded-lg text-white/70">
              Retry
            </button>
          </div>
        ) : (
          <div className="bg-white/5 rounded-xl overflow-hidden">
            {circuits.filter(c => c.circuitId > 0).map((circuit) => {
              const pumpSpeed = getPumpSpeed(circuit.circuitId);
              return (
                <button
                  key={circuit.circuitId}
                  onClick={() => openEditor(circuit)}
                  className="w-full flex justify-between items-start p-4 border-b border-white/5 last:border-0 active:bg-white/5 text-left"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-medium">{circuit.name}</span>
                      <span className="text-[11px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                        #{circuit.circuitId}
                      </span>
                    </div>
                    <div className="text-[13px] text-white/40 mt-0.5">
                      {getFunctionName(circuit.function)} · {getInterfaceName(circuit.interface)}
                    </div>
                    <div className="flex gap-3 mt-1.5 text-[12px]">
                      {pumpSpeed && (
                        <span className="text-white/35">
                          Pump: <span className="text-white/55">{pumpSpeed}</span>
                        </span>
                      )}
                      {circuit.freeze && (
                        <span className="text-cyan-400/60">Freeze protect</span>
                      )}
                    </div>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-white/30 mt-1">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Circuit Editor Modal */}
      <div className={`modal-backdrop ${editingCircuit ? 'open' : ''}`} onClick={closeEditor} />
      <div 
        className={`modal-sheet ${editingCircuit ? 'open' : ''}`}
        style={{ transform: sheetTranslateY > 0 && editingCircuit ? `translateY(${sheetTranslateY}px)` : undefined }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-9 h-1.5 bg-white/30 rounded-full mx-auto mt-2 cursor-grab" />
        <div className="flex justify-between items-center px-5 py-4">
          <span className="text-[20px] font-semibold">Edit Circuit #{editingCircuit?.circuitId}</span>
          <button onClick={closeEditor} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-white/60">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="px-5 pb-8 max-h-[70vh] overflow-y-auto">
          {editingCircuit && (
            <>
              {/* Name */}
              <div className="mb-5">
                <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider block mb-2">Name</label>
                
                {/* Toggle between built-in and custom */}
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => {
                      setUseCustomName(false);
                      // Reset to a built-in name - find matching or use current name's index
                      const builtIn = BUILT_IN_NAMES.find(n => n.name === formName) || BUILT_IN_NAMES.find(n => n.id === formNameIndex) || BUILT_IN_NAMES[0];
                      if (builtIn) {
                        setFormNameIndex(builtIn.id);
                        setFormName(builtIn.name);
                      }
                    }}
                    className={`flex-1 py-2 rounded-lg text-[13px] font-medium ${
                      !useCustomName ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/55'
                    }`}
                  >
                    Built-in
                  </button>
                  <button
                    onClick={() => {
                      setUseCustomName(true);
                      const slot = findAvailableCustomSlot();
                      setCustomNameIndex(slot);
                    }}
                    className={`flex-1 py-2 rounded-lg text-[13px] font-medium ${
                      useCustomName ? 'bg-cyan-500 text-black' : 'bg-white/10 text-white/55'
                    }`}
                  >
                    Custom
                  </button>
                </div>
                
                {useCustomName ? (
                  <div>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value.slice(0, 11))}
                      maxLength={11}
                      placeholder="Enter name (max 11 chars)"
                      className="w-full bg-white/10 rounded-lg px-4 py-3 text-[16px] placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    />
                    <p className="text-[11px] text-white/30 mt-1">{formName.length}/11 characters</p>
                  </div>
                ) : (
                  <select
                    value={formNameIndex}
                    onChange={(e) => {
                      const idx = parseInt(e.target.value);
                      setFormNameIndex(idx);
                      const name = BUILT_IN_NAMES.find(n => n.id === idx);
                      if (name) setFormName(name.name);
                    }}
                    className="w-full bg-white/10 rounded-lg px-4 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 appearance-none"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                  >
                    {/* If current nameIndex isn't in the list, add it as first option */}
                    {editingCircuit && !BUILT_IN_NAMES.find(n => n.id === editingCircuit.nameIndex) && editingCircuit.nameIndex < 92 && (
                      <option key={editingCircuit.nameIndex} value={editingCircuit.nameIndex}>
                        {editingCircuit.name} (current)
                      </option>
                    )}
                    {BUILT_IN_NAMES.map((name) => (
                      <option key={name.id} value={name.id}>{name.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Function */}
              <div className="mb-5">
                <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider block mb-2">Function</label>
                <select
                  value={formFunction}
                  onChange={(e) => setFormFunction(parseInt(e.target.value))}
                  className="w-full bg-white/10 rounded-lg px-4 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                >
                  {CIRCUIT_FUNCTIONS.map((func) => (
                    <option key={func.id} value={func.id}>{func.name}</option>
                  ))}
                </select>
              </div>

              {/* Interface */}
              <div className="mb-5">
                <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider block mb-2">Interface</label>
                <select
                  value={formInterface}
                  onChange={(e) => setFormInterface(parseInt(e.target.value))}
                  className="w-full bg-white/10 rounded-lg px-4 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 appearance-none"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                >
                  {CIRCUIT_INTERFACES.map((iface) => (
                    <option key={iface.id} value={iface.id}>{iface.name}</option>
                  ))}
                </select>
              </div>

              {/* Freeze Protection */}
              <div className="mb-5">
                <div className="flex justify-between items-center bg-white/5 rounded-xl p-4">
                  <div>
                    <div className="text-[16px] font-medium">Freeze Protection</div>
                    <div className="text-[12px] text-white/40">Run during freeze conditions</div>
                  </div>
                  <button
                    onClick={() => setFormFreeze(!formFreeze)}
                    className={`relative w-[52px] h-[32px] rounded-full transition-colors ${
                      formFreeze ? 'bg-[#00d2d3]' : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-[3px] w-[26px] h-[26px] rounded-full bg-white shadow-md transition-transform ${
                        formFreeze ? 'translate-x-[23px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Color Position (only for lights) */}
              {isLightFunction(formFunction) && (
                <div className="mb-5">
                  <label className="text-[12px] font-semibold text-white/35 uppercase tracking-wider block mb-2">Color Position</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="15"
                      value={formColorPos}
                      onChange={(e) => setFormColorPos(parseInt(e.target.value))}
                      className="flex-1 accent-cyan-500"
                    />
                    <span className="text-[16px] font-medium w-8 text-center">{formColorPos}</span>
                  </div>
                  <p className="text-[11px] text-white/30 mt-1">Position in color sync group</p>
                </div>
              )}

              {/* Pump Speed (read-only info) */}
              {getPumpSpeed(editingCircuit.circuitId) && (
                <div className="mb-5">
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-[12px] text-white/40 mb-1">Pump Speed</div>
                    <div className="text-[16px] font-medium">{getPumpSpeed(editingCircuit.circuitId)}</div>
                    <p className="text-[11px] text-white/30 mt-1">Edit in Pump settings</p>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <button
                onClick={saveCircuit}
                disabled={saving}
                className="w-full bg-cyan-500 disabled:bg-white/10 disabled:text-white/30 text-black font-semibold py-3 rounded-xl active:opacity-80 mt-4"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <Link href="/" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </Link>
        <Link href="/schedules" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Schedules</span>
        </Link>
        <Link href="/history" className="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-6"/></svg>
          <span>History</span>
        </Link>
        <Link href="/settings" className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>Settings</span>
        </Link>
      </nav>
    </>
  );
}
