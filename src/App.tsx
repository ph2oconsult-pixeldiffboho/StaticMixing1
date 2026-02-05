import React, { useState, useMemo, useRef } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart
} from 'recharts';
import { 
  Activity, Beaker, Layers, Settings2, Droplets, Waves, Upload, Loader2, Gauge, MapPin, Wind, Zap, Thermometer, Clock
} from 'lucide-react';
import { MixingInputs, ConduitType, ConduitShape, MixerModel, InjectionType, PitchRatio } from './types';
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

  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [guideContent, setGuideContent] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('ferric');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => calculateMixing(inputs), [inputs]);

  const handleInputChange = (field: keyof MixingInputs, value: any) => {
    setInputs(prev => {
      const next = { ...prev, [field]: value };
      
      // Auto-switching geometry logic
      if (field === 'conduitType') {
        next.mixerModel = MixerModel.NONE;
        next.conduitShape = value === ConduitType.PIPE ? ConduitShape.CIRCULAR : ConduitShape.RECTANGULAR;
      }
      
      // Auto-calculation for Lime
      if (field === 'slurryConcentration' && selectedPresetId === 'lime') {
        const conc = Number(value) || 0;
        next.chemicalDensity = 1000 + (7 * conc);
        next.chemicalViscosity = 0.001 * Math.exp(0.18 * conc);
      }
      
      return next;
    });
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = CHEMICAL_PRESETS.find(p => p.id === presetId);
    if (preset && presetId !== 'custom') {
      setInputs(prev => ({
        ...prev,
        chemicalType: preset.name,
        chemicalDensity: presetId === 'lime' ? (1000 + 7 * (prev.slurryConcentration || 10)) : preset.density,
        chemicalViscosity: presetId === 'lime' ? (0.001 * Math.exp(0.18 * (prev.slurryConcentration || 10))) : preset.viscosity
      }));
    }
  };

  const chartData = useMemo(() => {
    if (!results) return [];
    return Array.from({ length: 21 }, (_, i) => {
      const maxDist = Math.max(results.mixingDistanceNeeded || 0, inputs.availableLength, 5) * 1.5;
      const dist = (i / 20) * maxDist;
      const decayRate = inputs.conduitType === ConduitType.PIPE ? 0.75 * Math.sqrt(0.02) : 0.6;
      const Dh = results.hydraulicDiameter || 1;
      let cov = 1.0;
      if (inputs.mixerModel === MixerModel.NONE) {
        const alpha = (inputs.flowRate / 3600 * 3600000) / (inputs.chemicalFlow + inputs.dilutionWaterFlow || 1);
        const coVi = Math.sqrt(alpha) / (inputs.injectionType === InjectionType.TWIN ? 2 : 1);
        cov = coVi * Math.exp(-decayRate * (dist / Dh));
      } else {
        const mixerLen = (results.headlossMeters || 0) > 0 ? (results.headlossMeters * 10) : 1; 
        if (dist < mixerLen) {
          cov = 1.0 - (1.0 - (results.mixerCoV || 1.0)) * (dist / mixerLen);
        } else {
          cov = (results.mixerCoV || 1.0) * Math.exp(-decayRate * ((dist - mixerLen) / Dh));
        }
      }
      let dissolution = 0;
      if (selectedPresetId === 'lime') {
        const time = dist / (results.velocity || 1);
        const satLimit = results.limeSaturationLimit;
        const rateK = 0.3 * Math.sqrt(results.gValue / 100) * Math.max(0.1, (satLimit - inputs.chemicalDose) / satLimit);
        dissolution = (1 - Math.exp(-rateK * time)) * 100;
      }
      return { distance: dist.toFixed(1), cov: Math.min(1.0, Math.max(0.001, cov)), target: inputs.targetCoV, dissolution: Math.min(100, dissolution) };
    });
  }, [results, inputs, selectedPresetId]);

  const isLime = selectedPresetId === 'lime';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b border-slate-200 h-16 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <Waves size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FluidMix Pro</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">BHR Group CR 7469 Compliant</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIsExtracting(true);
              const reader = new FileReader();
              reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const content = await extractGuideData(base64);
                setGuideContent(content);
                setIsExtracting(false);
              };
              reader.readAsDataURL(file);
            }} />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm">
              {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Update Reference
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2 text-slate-700">
              <Activity size={18} />
              <h2 className="font-bold text-sm">Process Hydraulics</h2>
            </div>
            <InputGroup label="Bulk Flow (m³/h)" value={inputs.flowRate} onChange={(v: number) => handleInputChange('flowRate', v)} highlight />
            
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleInputChange('conduitType', ConduitType.PIPE)} className={`py-2 rounded-lg text-xs font-bold transition-all ${inputs.conduitType === ConduitType.PIPE ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Pipe</button>
              <button onClick={() => handleInputChange('conduitType', ConduitType.CHANNEL)} className={`py-2 rounded-lg text-xs font-bold transition-all ${inputs.conduitType === ConduitType.CHANNEL ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Channel</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InputGroup label={inputs.conduitShape === ConduitShape.CIRCULAR ? "Diameter (m)" : "Width (m)"} value={inputs.dimension} onChange={(v: number) => handleInputChange('dimension', v)} />
              {(inputs.conduitShape !== ConduitShape.CIRCULAR || inputs.conduitType === ConduitType.CHANNEL) && (
                <InputGroup label={inputs.conduitType === ConduitType.PIPE ? "Height (m)" : "Depth (m)"} value={inputs.depth} onChange={(v: number) => handleInputChange('depth', v)} />
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2 text-indigo-600">
              <Settings2 size={18} />
              <h2 className="font-bold text-sm">Mixing Setup</h2>
            </div>
            <select value={inputs.mixerModel} onChange={(e) => handleInputChange('mixerModel', e.target.value as MixerModel)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold">
              {inputs.conduitType === ConduitType.PIPE ? PIPE_MIXERS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>) : CHANNEL_MIXERS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
            </select>
            <InputGroup label="Elements (n)" value={inputs.numElements} onChange={(v: number) => handleInputChange('numElements', v)} />
            <InputGroup label="Available Length (m)" value={inputs.availableLength} onChange={(v: number) => handleInputChange('availableLength', v)} />
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Droplets size={18} />
              <h2 className="font-bold text-sm">Chemical Feed</h2>
            </div>
            <select value={selectedPresetId} onChange={(e) => handlePresetChange(e.target.value)} className="w-full bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm font-bold">
              {CHEMICAL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Dose (mg/L)" value={inputs.chemicalDose} onChange={(v: number) => handleInputChange('chemicalDose', v)} />
              <InputGroup label="Chem Flow (L/h)" value={inputs.chemicalFlow} onChange={(v: number) => handleInputChange('chemicalFlow', v)} />
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ResultMetric title="Achieved CoV" value={results.mixerCoV.toFixed(4)} subtitle={results.isCompliant ? 'Compliant' : 'Target Failed'} highlight={results.isCompliant ? 'green' : 'amber'} icon={<Layers size={14}/>} />
            <ResultMetric title="Velocity" value={`${results.velocity.toFixed(2)} m/s`} subtitle={`Re: ${results.reynoldsNumber.toLocaleString()}`} icon={<Wind size={14}/>} highlight="blue" />
            <ResultMetric title="Crit. Distance" value={`${results.mixingDistanceNeeded.toFixed(2)} m`} subtitle="Full Blend Point" icon={<MapPin size={14}/>} highlight="blue" />
            <ResultMetric title="Headloss" value={`${results.headlossMeters.toFixed(3)} m`} subtitle={`${results.headloss.toFixed(2)} kPa | G: ${Math.floor(results.gValue)}s⁻¹`} icon={<Gauge size={14}/>} />
          </div>

          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-indigo-600" /> Mixing Projection</h3>
              <div className="text-[10px] font-bold uppercase text-slate-400 flex gap-4">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-600"></div> CoV Profile</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Target</span>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="distance" tick={{fontSize: 10}} />
                  <YAxis domain={[0, 1]} tick={{fontSize: 10}} />
                  <Tooltip />
                  <ReferenceLine y={inputs.targetCoV} stroke="#f43f5e" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="cov" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.05} strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2"><Zap size={18} /><h3 className="font-bold text-sm">AI Audit Report</h3></div>
              <button onClick={async () => { setIsAnalyzing(true); const res = await getAIRecommendations(inputs, results, guideContent); setAiAnalysis(res); setIsAnalyzing(false); }} className="text-xs font-bold bg-white text-slate-900 px-4 py-1.5 rounded-lg">
                {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : 'Run Audit'}
              </button>
            </div>
            <div className="p-6 prose prose-indigo prose-sm max-w-none">
              {aiAnalysis ? aiAnalysis.split('\n').map((l, i) => <p key={i}>{l}</p>) : <p className="text-slate-400 text-center italic">Run audit for professional assessment.</p>}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

const InputGroup = ({ label, value, onChange, highlight }: any) => (
  <div>
    <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${highlight ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</label>
    <input type="number" value={value} onChange={(e) => {
      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
      onChange(isNaN(val) ? 0 : val);
    }} className={`w-full border rounded-xl px-3 py-2 text-sm outline-none ${highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`} />
  </div>
);

const ResultMetric = ({ title, value, subtitle, highlight = 'slate', icon }: any) => {
  const colors: any = { green: 'bg-green-50 text-green-700 border-green-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', blue: 'bg-blue-50 text-blue-700 border-blue-100', slate: 'bg-white text-slate-900 border-slate-200' };
  return (
    <div className={`p-5 rounded-2xl border shadow-sm ${colors[highlight]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase opacity-60">{title}</span>
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] font-bold mt-1 opacity-60">{subtitle}</div>
    </div>
  );
};

export default App;
