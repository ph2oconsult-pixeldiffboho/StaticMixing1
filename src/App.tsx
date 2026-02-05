
import React, { useState, useEffect, useRef } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area, Line, ComposedChart
} from 'recharts';
import { 
  Activity, Beaker, Info, Layers, Settings2, Droplets, Waves, Upload, Loader2, Gauge, Target, Timer, MapPin, Percent, ChevronRight, Thermometer, Zap, Ruler, AlertTriangle, GitMerge, Drill, Box, Circle, Pyramid, Wind, Clock, CheckCircle2, XCircle
} from 'lucide-react';
import { MixingInputs, ConduitType, ConduitShape, CalculationResults, MixerModel, InjectionType, PitchRatio } from './types';
import { calculateMixing } from './calculations';
import { getAIRecommendations, extractGuideData } from './services/gemini';

const CHEMICAL_PRESETS = [
  { id: 'custom', name: 'Custom / Manual Entry', density: 1000, viscosity: 0.001 },
  { id: 'ferric', name: 'Ferric Chloride (40%)', density: 1450, viscosity: 0.015 },
  { id: 'alum', name: 'Alum (Aluminium Sulphate)', density: 1320, viscosity: 0.025 },
  { id: 'hypo', name: 'Sodium Hypochlorite (15%)', density: 1210, viscosity: 0.003 },
  { id: 'permanganate', name: 'Potassium Permanganate (5%)', density: 1030, viscosity: 0.001 },
  { id: 'amm_sulphate', name: 'Ammonium Sulphate (40%)', density: 1230, viscosity: 0.002 },
  { id: 'chlorine', name: 'Liquid Chlorine', density: 1460, viscosity: 0.0003 },
  { id: 'fluorosilicic', name: 'Fluorosilicic Acid (25%)', density: 1220, viscosity: 0.002 },
  { id: 'soda_ash', name: 'Sodium Carbonate (Soda Ash 10%)', density: 1100, viscosity: 0.002 },
  { id: 'lime', name: 'Lime Slurry (Variable %)', density: 1070, viscosity: 0.005 },
  { id: 'polydadmac', name: 'polyDADMAC', density: 1040, viscosity: 0.1 },
  { id: 'poly_conc', name: 'Polymer (Concentrate)', density: 1050, viscosity: 0.8 },
  { id: 'poly_dilute', name: 'Dilute Polymer (0.1%)', density: 1000, viscosity: 0.01 },
  { id: 'peroxide', name: 'Hydrogen Peroxide (50%)', density: 1190, viscosity: 0.0012 },
  { id: 'caustic', name: 'Caustic Soda (50%)', density: 1530, viscosity: 0.08 },
  { id: 'acid', name: 'Sulphuric Acid (98%)', density: 1840, viscosity: 0.027 },
];

const PIPE_MIXERS = [
  { id: MixerModel.NONE, name: 'Natural Pipe Mixing (Section C7)' },
  { id: MixerModel.KENICS_KM, name: 'Chemineer Kenics KM (Section C1)' },
  { id: MixerModel.HEV, name: 'Chemineer HEV Pipe (Section C2)' },
  { id: MixerModel.SMV, name: 'Sulzer SMV (Section C3)' },
  { id: MixerModel.STM, name: 'Statiflo STM Pipe (Section C4)' },
];

const CHANNEL_MIXERS = [
  { id: MixerModel.NONE, name: 'Natural Channel Mixing (Section C19)' },
  { id: MixerModel.HEV, name: 'Chemineer HEV Channel (Section C14)' },
  { id: MixerModel.STM, name: 'Statiflo STM Channel (Section C16)' },
  { id: MixerModel.BAFFLES, name: 'DIY Baffles (Section C17)' },
  { id: MixerModel.WEIR, name: 'Overflow Weir (Section C20)' },
];

const App: React.FC = () => {
  const [inputs, setInputs] = useState<MixingInputs>({
    conduitType: ConduitType.PIPE,
    conduitShape: ConduitShape.CIRCULAR,
    mixerModel: MixerModel.NONE,
    numElements: 4,
    flowRate: 1500,
    dimension: 0.8,
    depth: 0.6,
    availableLength: 10,
    viscosity: 0.001,
    density: 1000,
    chemicalType: 'Ferric Chloride (40%)',
    chemicalDose: 1.0,
    chemicalFlow: 10,
    chemicalDensity: 1450,
    chemicalViscosity: 0.015,
    dilutionWaterFlow: 200,
    targetCoV: 0.05,
    targetMixingTime: 10.0,
    slurryConcentration: 10,
    injectionType: InjectionType.SINGLE,
    pitchRatio: PitchRatio.PR_1_5,
    waterTemperature: 15
  });

  const [results, setResults] = useState<CalculationResults | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [guideContent, setGuideContent] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('ferric');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setResults(calculateMixing(inputs));
  }, [inputs]);

  const calculateLimeProps = (conc: number) => {
    const density = 1000 + (7 * conc);
    const viscosity = 0.001 * Math.exp(0.18 * conc);
    return { density, viscosity };
  };

  const handleInputChange = (field: keyof MixingInputs, value: any) => {
    if (field === 'conduitType' && value !== inputs.conduitType) {
      setInputs(prev => ({ 
        ...prev, 
        [field]: value, 
        mixerModel: MixerModel.NONE,
        conduitShape: value === ConduitType.PIPE ? ConduitShape.CIRCULAR : ConduitShape.RECTANGULAR
      }));
    } else if (field === 'slurryConcentration' && selectedPresetId === 'lime') {
      const { density, viscosity } = calculateLimeProps(Number(value));
      setInputs(prev => ({ 
        ...prev, 
        slurryConcentration: Number(value),
        chemicalDensity: density,
        chemicalViscosity: viscosity
      }));
    } else {
      setInputs(prev => ({ ...prev, [field]: value }));
    }
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = CHEMICAL_PRESETS.find(p => p.id === presetId);
    if (preset && presetId !== 'custom') {
      if (presetId === 'lime') {
        const { density, viscosity } = calculateLimeProps(inputs.slurryConcentration || 10);
        setInputs(prev => ({
          ...prev,
          chemicalType: preset.name,
          chemicalDensity: density,
          chemicalViscosity: viscosity
        }));
      } else {
        setInputs(prev => ({
          ...prev,
          chemicalType: preset.name,
          chemicalDensity: preset.density,
          chemicalViscosity: preset.viscosity
        }));
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const content = await extractGuideData(base64);
        setGuideContent(content);
      };
    } finally {
      setIsExtracting(false);
    }
  };

  const chartData = Array.from({ length: 21 }, (_, i) => {
    const maxDist = Math.max(results?.mixingDistanceNeeded || 0, inputs.availableLength, 5) * 1.5;
    const dist = (i / 20) * maxDist;
    const decayRate = inputs.conduitType === ConduitType.PIPE ? 0.75 * Math.sqrt(0.02) : 0.6;
    const hydraulicDiameter = results?.hydraulicDiameter || 1;
    
    let cov = 1.0;
    if (inputs.mixerModel === MixerModel.NONE) {
      const alpha = (inputs.flowRate / 3600 * 3600000) / (inputs.chemicalFlow + inputs.dilutionWaterFlow || 1);
      const coVi = Math.sqrt(alpha) / (inputs.injectionType === InjectionType.TWIN ? 2 : 1);
      cov = coVi * Math.exp(-decayRate * (dist / hydraulicDiameter));
    } else {
      const mixerLen = (results?.headlossMeters || 0) > 0 ? (results.headlossMeters * 10) : 1; 
      if (dist < mixerLen) {
        cov = 1.0 - (1.0 - (results?.mixerCoV || 1.0)) * (dist / mixerLen);
      } else {
        cov = (results?.mixerCoV || 1.0) * Math.exp(-decayRate * ((dist - mixerLen) / hydraulicDiameter));
      }
    }

    let dissolution = 0;
    if (selectedPresetId === 'lime' && results) {
      const time = dist / (results.velocity || 1);
      const satLimit = results.limeSaturationLimit;
      const saturationFactor = Math.max(0.1, (satLimit - inputs.chemicalDose) / satLimit);
      const rateK = 0.3 * Math.sqrt(results.gValue / 100) * saturationFactor;
      dissolution = (1 - Math.exp(-rateK * time)) * 100;
    }

    return { 
      distance: dist.toFixed(1), 
      cov: Math.min(1.0, Math.max(0.001, cov)), 
      target: inputs.targetCoV,
      dissolution: Math.min(100, dissolution)
    };
  });

  const isLime = selectedPresetId === 'lime';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 h-16 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg ring-4 ring-indigo-50">
              <Waves size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FluidMix Pro</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">BHR Group CR 7469 Compliant</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
              disabled={isExtracting}
            >
              {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isExtracting ? 'Syncing BHR Guide...' : 'Update Reference Guide'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Inputs Column */}
        <div className="lg:col-span-4 space-y-6">
          
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 ring-2 ring-slate-400/20">
            <div className="flex items-center gap-2 mb-2 text-slate-700">
              <Activity size={18} />
              <h2 className="font-bold text-sm">Main Process Hydraulics</h2>
            </div>
            <InputGroup 
              label="Bulk Flow (m³/h)" 
              value={inputs.flowRate} 
              onChange={(v: number) => handleInputChange('flowRate', v)} 
              highlight
              highlightColor="slate"
            />
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between mb-2 text-emerald-600">
              <div className="flex items-center gap-2">
                <Target size={18} />
                <h2 className="font-bold text-sm">Design Requirements</h2>
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${results?.isTimeCompliant ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                {results?.isTimeCompliant ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                Time to CoV: {results?.mixingTimeNeeded.toFixed(2)}s
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup 
                label="Target CoV" 
                value={inputs.targetCoV} 
                step={0.005} 
                onChange={(v: number) => handleInputChange('targetCoV', v)} 
                highlight 
                highlightColor="emerald"
              />
              <InputGroup 
                label="Max Mix Time (s)" 
                value={inputs.targetMixingTime} 
                onChange={(v: number) => handleInputChange('targetMixingTime', v)}
                icon={<Clock size={10} />}
                highlight
                highlightColor="emerald"
              />
            </div>
            <div className="pt-2 border-t border-slate-100">
              <InputGroup 
                label="Water Temp (°C)" 
                value={inputs.waterTemperature} 
                onChange={(v: number) => handleInputChange('waterTemperature', v)}
                icon={<Thermometer size={10} />}
              />
            </div>
          </section>

          {/* New Geometry Settings Section */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 ring-2 ring-blue-500/10">
            <div className="flex items-center justify-between mb-2 text-blue-600">
              <div className="flex items-center gap-2">
                <Box size={18} />
                <h2 className="font-bold text-sm">Conduit Geometry</h2>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-100 animate-pulse">
                <Wind size={10} />
                {results?.velocity.toFixed(2)} m/s
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-2">
              <button 
                onClick={() => handleInputChange('conduitType', ConduitType.PIPE)} 
                className={`py-2 rounded-lg text-xs font-bold transition-all ${inputs.conduitType === ConduitType.PIPE ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
              >
                Pipe (Duct)
              </button>
              <button 
                onClick={() => handleInputChange('conduitType', ConduitType.CHANNEL)} 
                className={`py-2 rounded-lg text-xs font-bold transition-all ${inputs.conduitType === ConduitType.CHANNEL ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
              >
                Open Channel
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cross-Section Shape</label>
                <div className="grid grid-cols-2 gap-2">
                  <ShapeButton 
                    active={inputs.conduitShape === ConduitShape.CIRCULAR} 
                    onClick={() => handleInputChange('conduitShape', ConduitShape.CIRCULAR)}
                    icon={<Circle size={14} />}
                    label="Circular"
                    disabled={inputs.conduitType === ConduitType.CHANNEL}
                  />
                  <ShapeButton 
                    active={inputs.conduitShape === ConduitShape.RECTANGULAR} 
                    onClick={() => handleInputChange('conduitShape', ConduitShape.RECTANGULAR)}
                    icon={<Box size={14} />}
                    label="Square / Rect"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputGroup 
                  label={inputs.conduitShape === ConduitShape.CIRCULAR ? "Diameter (m)" : "Base Width (m)"} 
                  value={inputs.dimension} 
                  onChange={(v: number) => handleInputChange('dimension', v)} 
                />
                {(inputs.conduitShape !== ConduitShape.CIRCULAR || inputs.conduitType === ConduitType.CHANNEL) && (
                  <InputGroup 
                    label={inputs.conduitType === ConduitType.PIPE ? "Height (m)" : "Water Depth (m)"} 
                    value={inputs.depth} 
                    onChange={(v: number) => handleInputChange('depth', v)} 
                  />
                )}
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 ring-2 ring-indigo-500/10">
            <div className="flex items-center gap-2 mb-2 text-indigo-600">
              <Settings2 size={18} />
              <h2 className="font-bold text-sm">Mixing Strategy</h2>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Hardware Selection</label>
              <select 
                value={inputs.mixerModel}
                onChange={(e) => handleInputChange('mixerModel', e.target.value as MixerModel)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {inputs.conduitType === ConduitType.PIPE ? PIPE_MIXERS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>) : CHANNEL_MIXERS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
            </div>

            {inputs.mixerModel === MixerModel.STM && (
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase">Hardware Tuning</label>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Pitch Ratio</label>
                  <select 
                    value={inputs.pitchRatio}
                    onChange={(e) => handleInputChange('pitchRatio', e.target.value as PitchRatio)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold"
                  >
                    <option value={PitchRatio.PR_1_125}>1.125:1</option>
                    <option value={PitchRatio.PR_1_5}>1.5:1</option>
                    <option value={PitchRatio.PR_2_25}>2.25:1</option>
                  </select>
                </div>
              </div>
            )}

            {![MixerModel.NONE, MixerModel.WEIR].includes(inputs.mixerModel) && (
              <InputGroup label="Number of Elements (n)" value={inputs.numElements} onChange={(v: number) => handleInputChange('numElements', v)} />
            )}
            <InputGroup label="Available Length (m)" value={inputs.availableLength} onChange={(v: number) => handleInputChange('availableLength', v)} />
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 ring-2 ring-indigo-500/10">
            <div className="flex items-center gap-2 text-indigo-600">
              <Droplets size={18} />
              <h2 className="font-bold text-sm">Chemical Injection</h2>
            </div>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Chemical Selection</label>
              <select 
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {CHEMICAL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                <GitMerge size={10} /> Feed Arrangement
              </label>
              <select 
                value={inputs.injectionType}
                onChange={(e) => handleInputChange('injectionType', e.target.value as InjectionType)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={InjectionType.SINGLE}>Single Point (Quill)</option>
                <option value={InjectionType.TWIN}>Twin Point (BHR Recommended)</option>
              </select>
            </div>
            
            {isLime && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-3 shadow-inner">
                <div className="flex items-center gap-2 text-amber-700">
                  <Percent size={14} />
                  <span className="text-xs font-bold uppercase tracking-wider">Lime Kinetics</span>
                </div>
                <InputGroup 
                  label="Slurry Conc %" 
                  value={inputs.slurryConcentration} 
                  onChange={(v: number) => handleInputChange('slurryConcentration', v)} 
                  highlight 
                  highlightColor="amber"
                />
                <InputGroup 
                  label="Target Dose (mg/L)" 
                  value={inputs.chemicalDose} 
                  onChange={(v: number) => handleInputChange('chemicalDose', v)} 
                  highlight
                  highlightColor="amber"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Chem Flow (L/h)" value={inputs.chemicalFlow} onChange={(v: number) => handleInputChange('chemicalFlow', v)} />
              <InputGroup label="Dilution (L/h)" value={inputs.dilutionWaterFlow} onChange={(v: number) => handleInputChange('dilutionWaterFlow', v)} highlight />
            </div>
          </section>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ResultMetric 
              title="Mixing efficiency" 
              value={results?.mixerCoV.toFixed(4)} 
              subtitle={results?.isCompliant ? 'CoV Target Met' : 'CoV Target Failed'}
              highlight={results?.isCompliant ? 'green' : 'amber'} 
              icon={<Layers size={14}/>} 
            />
            {isLime ? (
              <ResultMetric 
                title="Time to Dissolve" 
                value={`${results?.timeTo95Dissolution.toFixed(1)}s`} 
                subtitle={`Reach 95% solubility`} 
                highlight={results?.dissolvedAtTarget > 90 ? 'blue' : 'amber'} 
                icon={<Timer size={14}/>} 
              />
            ) : (
              <ResultMetric 
                title="Retention Time" 
                value={`${results?.mixingTimeNeeded.toFixed(1)}s`} 
                subtitle={results?.isTimeCompliant ? "Time Requirement Met" : "Exceeds Time Limit"} 
                icon={<Timer size={14}/>} 
                highlight={results?.isTimeCompliant ? "blue" : "amber"} 
              />
            )}
            <ResultMetric 
               title="Critical Distance" 
               value={`${results?.mixingDistanceNeeded.toFixed(2)} m`} 
               subtitle={isLime ? `Limited by Dissolution` : `Blending Requirement`} 
               icon={<MapPin size={14}/>} 
               highlight="blue" 
            />
            <ResultMetric title="Pressure Drop" value={`${results?.headloss.toFixed(2)} kPa`} subtitle={`G-Value: ${Math.floor(results?.gValue || 0)} s⁻¹`} icon={<Gauge size={14}/>} />
          </div>

          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600 opacity-20"></div>
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Activity size={18} className="text-indigo-600" />
                Hydraulic & Kinetic Projection
              </h3>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex gap-4">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-600"></div> CoV Profile</span>
                {isLime && <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Dissolution %</span>}
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Target Threshold</span>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="distance" tick={{fontSize: 10}} label={{value: 'Length (m)', position: 'insideBottom', offset: -5, fontSize: 10}} />
                  <YAxis yAxisId="left" domain={[0, 1]} tick={{fontSize: 10}} label={{value: 'CoV', angle: -90, position: 'insideLeft', fontSize: 10}} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{fontSize: 10}} label={{value: 'Dissolution (%)', angle: 90, position: 'insideRight', fontSize: 10}} />
                  <Tooltip />
                  <ReferenceLine yAxisId="left" y={inputs.targetCoV} stroke="#f43f5e" strokeDasharray="3 3" />
                  <Area yAxisId="left" type="monotone" dataKey="cov" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.05} strokeWidth={3} />
                  {isLime && <Line yAxisId="right" type="monotone" dataKey="dissolution" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 5" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden border-l-4 border-l-indigo-600">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Drill size={14} className="text-indigo-600" />
                Dosing Hardware Specifications
              </h3>
              <div className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">
                BHR Momentum-Optimized
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-600 border border-indigo-100">
                    <Ruler size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Suggested Orifice (ID)</div>
                    <div className="text-2xl font-bold text-slate-800">{results?.suggestedOrificeDiameter.toFixed(1)} mm</div>
                    <div className="text-[10px] text-indigo-600 font-bold mt-1 uppercase tracking-tighter">
                      Target Velocity: {( (results?.totalInjectionFlow || 0) / 3600000 / ( (inputs.injectionType === InjectionType.TWIN ? 2 : 1) * Math.PI * Math.pow((results?.suggestedOrificeDiameter || 1) / 2000, 2) ) ).toFixed(2)} m/s
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-[11px] leading-relaxed text-slate-600 italic">
                  <strong>Guideline:</strong> Sized for a momentum ratio of 0.22. This balances jet penetration with cross-flow mixing without 'hitting' the opposite wall.
                </div>
              </div>
              <div className="space-y-4">
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-2 border-b border-slate-100 pb-1">Manufacturer Recommended Installation</div>
                <div className="p-4 border border-indigo-100 rounded-xl bg-white shadow-sm">
                  <p className="text-sm font-semibold text-slate-800 leading-snug">
                    {results?.manufacturerNotes}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                    <Info size={12} /> BHR CR 7469 Logic
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-500">Hydraulic Audit Data</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                Dh: {results?.hydraulicDiameter.toFixed(3)}m
              </span>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <SpecItem label="Flow Velocity" value={`${results?.velocity.toFixed(2)} m/s`} />
              <SpecItem label="Reynolds (Re)" value={results?.reynoldsNumber.toLocaleString() || '0'} />
              <SpecItem label="Momentum Ratio" value={results?.momentumRatio.toFixed(3) || '0'} subtext={results?.momentumRegime} />
              {isLime ? (
                <SpecItem 
                  label="95% Soluble Point" 
                  value={`${results?.distanceTo95Dissolution.toFixed(2)} m`} 
                  icon={<Ruler size={10} />} 
                  subtext={inputs.chemicalDose > (results?.limeSaturationLimit || 0) ? "Exceeds Solubility" : "Fully Soluble"}
                  danger={inputs.chemicalDose > (results?.limeSaturationLimit || 0)}
                />
              ) : (
                <SpecItem label="Avg G-Value" value={`${Math.floor(results?.gValue || 0)} s⁻¹`} />
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={18} />
                <h3 className="font-bold text-sm">Professional Audit Report</h3>
              </div>
              <button 
                onClick={async () => {
                  if (!results) return;
                  setIsAnalyzing(true);
                  const res = await getAIRecommendations(inputs, results, guideContent);
                  setAiAnalysis(res);
                  setIsAnalyzing(false);
                }} 
                className="text-xs font-bold bg-white text-slate-900 px-4 py-1.5 rounded-lg hover:bg-slate-50 shadow-sm transition-all flex items-center gap-2"
                disabled={isAnalyzing}
              >
                {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Beaker size={12} />}
                {isAnalyzing ? 'Processing Calculations...' : 'Execute Professional Audit'}
              </button>
            </div>
            <div className="p-6 min-h-[140px] bg-white prose prose-indigo prose-sm max-w-none">
              {aiAnalysis ? (
                <div className="space-y-4">
                   {aiAnalysis.split('\n').map((line, i) => (
                     line.startsWith('#') 
                      ? <h4 key={i} className="font-bold text-slate-900 border-b border-slate-100 pb-1 pt-2">{line.replace(/#/g, '')}</h4>
                      : <p key={i} className="text-slate-700 leading-relaxed m-0">{line}</p>
                   ))}
                </div>
              ) : (
                <div className="text-center text-slate-400 py-6">
                  <Waves size={32} className="mx-auto opacity-20 mb-3" />
                  <p className="text-xs font-medium italic">Execute professional audit to verify mixing vs dissolution metrics.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

const ShapeButton = ({ active, onClick, icon, label, disabled = false }: any) => (
  <button 
    disabled={disabled}
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${disabled ? 'opacity-30 cursor-not-allowed bg-slate-50 grayscale' : active ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
  >
    {icon}
    <span className="text-[9px] font-bold mt-1">{label}</span>
  </button>
);

const InputGroup = ({ label, value, onChange, step = 1, highlight = false, highlightColor = 'indigo', icon }: any) => {
  const highlightStyles: any = {
    emerald: 'bg-emerald-50 border-emerald-200 focus:ring-2 focus:ring-emerald-400',
    indigo: 'bg-indigo-50 border-indigo-200 focus:ring-2 focus:ring-indigo-400',
    slate: 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-slate-400',
    blue: 'bg-blue-50 border-blue-200 focus:ring-2 focus:ring-blue-400',
    amber: 'bg-amber-50 border-amber-200 focus:ring-2 focus:ring-amber-400',
  };

  const labelStyles: any = {
    emerald: 'text-emerald-600',
    indigo: 'text-indigo-600',
    slate: 'text-slate-600',
    blue: 'text-blue-600',
    amber: 'text-amber-600',
  };

  return (
    <div>
      <label className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-1 ${highlight ? labelStyles[highlightColor] : 'text-slate-400'}`}>
        {icon} {label}
      </label>
      <input 
        type="number" step={step} value={value} 
        onChange={(e) => onChange(Number(e.target.value))} 
        className={`w-full border rounded-xl px-3 py-2 text-sm outline-none transition-all ${highlight ? highlightStyles[highlightColor] : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-indigo-500'}`} 
      />
    </div>
  );
};

const ResultMetric = ({ title, value, subtitle, highlight = 'slate', icon }: any) => {
  const colors: any = { 
    green: 'bg-green-50 text-green-700 border-green-100', 
    amber: 'bg-amber-50 text-amber-700 border-amber-100', 
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    slate: 'bg-white text-slate-900 border-slate-200' 
  };
  return (
    <div className={`p-5 rounded-2xl border shadow-sm ${colors[highlight]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</span>
        {icon}
      </div>
      <div className="text-xl lg:text-2xl font-bold truncate">{value}</div>
      {subtitle && <div className="text-[10px] font-bold mt-1 opacity-60 truncate">{subtitle}</div>}
    </div>
  );
};

const SpecItem = ({ label, value, subtext, icon, danger = false }: any) => (
  <div className="space-y-1">
    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter flex items-center justify-center gap-1">{icon} {label}</div>
    <div className={`text-sm font-bold ${danger ? 'text-rose-600' : 'text-slate-800'}`}>{value}</div>
    {subtext && <div className={`text-[9px] font-bold flex items-center justify-center gap-1 ${danger ? 'text-rose-500' : 'text-indigo-500'}`}>
      {danger && <AlertTriangle size={8} />} {subtext}
    </div>}
  </div>
);

export default App;
