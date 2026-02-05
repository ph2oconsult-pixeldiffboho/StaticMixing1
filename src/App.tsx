import React, { useState, useMemo, useRef } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart
} from 'recharts';
import { 
  Activity, Beaker, Layers, Settings2, Droplets, Waves, Upload, Loader2, Gauge, MapPin, Wind, Zap, Thermometer, Clock, ChevronRight, FileDown
} from 'lucide-react';
import { jsPDF } from 'jspdf';
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

const MarkdownDisplay: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-2">
      {lines.map((line, idx) => {
        let trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-2" />;
        
        if (trimmed.startsWith('#')) {
          const level = trimmed.match(/^#+/)?.[0].length || 1;
          const text = trimmed.replace(/^#+\s*/, '');
          const classes = level === 1 ? "text-lg font-bold text-slate-900 mt-4 mb-2" : "text-sm font-bold text-indigo-700 mt-3 mb-1 uppercase tracking-tight";
          return <div key={idx} className={classes}>{text}</div>;
        }

        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const text = trimmed.replace(/^[-*]\s*/, '');
          return (
            <div key={idx} className="flex gap-2 pl-2 text-slate-700 text-xs">
              <ChevronRight size={12} className="mt-0.5 text-indigo-500 shrink-0" />
              <span>{renderBoldText(text)}</span>
            </div>
          );
        }

        return <p key={idx} className="text-slate-700 text-xs leading-relaxed">{renderBoldText(trimmed)}</p>;
      })}
    </div>
  );
};

const renderBoldText = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

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
      if (field === 'conduitType') {
        next.mixerModel = MixerModel.NONE;
        next.conduitShape = value === ConduitType.PIPE ? ConduitShape.CIRCULAR : ConduitShape.RECTANGULAR;
      }
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

  const handleDownloadPDF = () => {
    if (!aiAnalysis) return;
    
    const doc = new jsPDF();
    const margin = 20;
    let y = 20;

    // Header Branding
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('FluidMix Pro', margin, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text('Professional Engineering Audit Report - BHR CR 7469 Methodology', margin, y);
    y += 15;

    // Summary Box
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.rect(margin, y, 170, 40, 'FD');
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.setFont('helvetica', 'bold');
    doc.text('Design Parameters Context:', margin + 5, y + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Conduit: ${inputs.conduitType} (${inputs.dimension}m x ${inputs.depth || 'N/A'}m)`, margin + 5, y + 18);
    doc.text(`Mixer: ${inputs.mixerModel} (${inputs.numElements} Elements)`, margin + 5, y + 25);
    doc.text(`Process Flow: ${inputs.flowRate} m3/h`, margin + 5, y + 32);
    
    doc.text(`Chemical Feed: ${inputs.chemicalType}`, margin + 90, y + 18);
    doc.text(`Target Dose: ${inputs.chemicalDose} mg/L`, margin + 90, y + 25);
    doc.text(`Momentum Ratio: ${results.momentumRatio.toFixed(3)}`, margin + 90, y + 32);
    
    y += 50;

    // Report Content
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text('Engineering Assessment & Audit Findings', margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');

    // Clean text for PDF (removing markdown bold markers)
    const cleanAnalysis = aiAnalysis.replace(/\*\*/g, '');
    const splitText = doc.splitTextToSize(cleanAnalysis, 170);
    
    for (let i = 0; i < splitText.length; i++) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(splitText[i], margin, y);
      y += 6;
    }

    // Page Footer
    const totalPages = doc.getNumberOfPages();
    for(let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generated on ${new Date().toLocaleString()} | fluidmix-pro-v1.0 | Page ${i} of ${totalPages}`, margin, 285);
    }

    doc.save(`FluidMix_Audit_Report_${new Date().getTime()}.pdf`);
  };

  const chartData = useMemo(() => {
    if (!results) return [];
    return Array.from({ length: 21 }, (_, i) => {
      const maxDist = Math.max(results.mixingDistanceNeeded || 0, inputs.availableLength, 5) * 1.2;
      const dist = (i / 20) * maxDist;
      const decayRate = inputs.conduitType === ConduitType.PIPE ? 0.75 * Math.sqrt(0.02) : 0.6;
      const Dh = results.hydraulicDiameter || 1;
      let cov = 1.0;
      if (inputs.mixerModel === MixerModel.NONE) {
        const alpha = (inputs.flowRate / 3600 * 3600000) / (inputs.chemicalFlow + inputs.dilutionWaterFlow || 1);
        const coVi = Math.sqrt(alpha) / (inputs.injectionType === InjectionType.TWIN ? 2 : 1);
        cov = coVi * Math.exp(-decayRate * (dist / Dh));
      } else {
        const mixerLen = (results.headlossMeters || 0) > 0 ? (results.headlossMeters * 5) : 1; 
        if (dist < mixerLen) {
          cov = 1.0 - (1.0 - (results.mixerCoV || 1.0)) * (dist / mixerLen);
        } else {
          cov = (results.mixerCoV || 1.0) * Math.exp(-decayRate * ((dist - mixerLen) / Dh));
        }
      }
      return { distance: dist.toFixed(1), cov: Math.min(1.0, Math.max(0.001, cov)), target: inputs.targetCoV };
    });
  }, [results, inputs]);

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
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">BHR Group CR 7469 Engineering System</p>
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
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm transition-colors">
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
              <Activity size={18} className="text-indigo-600" />
              <h2 className="font-bold text-sm">Process Hydraulics</h2>
            </div>
            <InputGroup label="Bulk Flow (m³/h)" value={inputs.flowRate} onChange={(v: number) => handleInputChange('flowRate', v)} highlight />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleInputChange('conduitType', ConduitType.PIPE)} className={`py-2 rounded-lg text-xs font-bold transition-all ${inputs.conduitType === ConduitType.PIPE ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Pipe</button>
              <button onClick={() => handleInputChange('conduitType', ConduitType.CHANNEL)} className={`py-2 rounded-lg text-xs font-bold transition-all ${inputs.conduitType === ConduitType.CHANNEL ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-100' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Channel</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label={inputs.conduitShape === ConduitShape.CIRCULAR ? "Diameter (m)" : "Width (m)"} value={inputs.dimension} onChange={(v: number) => handleInputChange('dimension', v)} />
              {(inputs.conduitShape !== ConduitShape.CIRCULAR || inputs.conduitType === ConduitType.CHANNEL) && (
                <InputGroup label={inputs.conduitType === ConduitType.PIPE ? "Height (m)" : "Water Depth (m)"} value={inputs.depth} onChange={(v: number) => handleInputChange('depth', v)} />
              )}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2 text-indigo-600">
              <Settings2 size={18} />
              <h2 className="font-bold text-sm">Mixing Solution</h2>
            </div>
            <select value={inputs.mixerModel} onChange={(e) => handleInputChange('mixerModel', e.target.value as MixerModel)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500">
              {inputs.conduitType === ConduitType.PIPE ? PIPE_MIXERS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>) : CHANNEL_MIXERS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <InputGroup label="Elements (n)" value={inputs.numElements} onChange={(v: number) => handleInputChange('numElements', v)} />
              <InputGroup label="Available (m)" value={inputs.availableLength} onChange={(v: number) => handleInputChange('availableLength', v)} />
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Droplets size={18} />
              <h2 className="font-bold text-sm">Chemical Injection</h2>
            </div>
            <select value={selectedPresetId} onChange={(e) => handlePresetChange(e.target.value)} className="w-full bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500">
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
            <ResultMetric title="Achieved CoV" value={results.mixerCoV.toFixed(4)} subtitle={results.isCompliant ? 'Target Compliant' : 'Target Failed'} highlight={results.isCompliant ? 'green' : 'amber'} icon={<Layers size={14}/>} />
            <ResultMetric title="Velocity" value={`${results.velocity.toFixed(2)} m/s`} subtitle={`Re: ${results.reynoldsNumber.toLocaleString()}`} icon={<Wind size={14}/>} highlight="blue" />
            <ResultMetric title="Crit. Distance" value={`${results.mixingDistanceNeeded.toFixed(2)} m`} subtitle="Full Blend Required" icon={<MapPin size={14}/>} highlight="blue" />
            <ResultMetric title="Headloss" value={`${results.headlossMeters.toFixed(3)} m`} subtitle={`${results.headloss.toFixed(2)} kPa | ${Math.floor(results.gValue)} s⁻¹`} icon={<Gauge size={14}/>} />
          </div>

          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} className="text-indigo-600" /> Mixing Decay Projection</h3>
              <div className="text-[10px] font-bold uppercase text-slate-400 flex gap-4">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-600"></div> CoV Profile</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Target Threshold</span>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="distance" tick={{fontSize: 10}} label={{ value: 'Distance (m)', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                  <YAxis domain={[0, 1]} tick={{fontSize: 10}} label={{ value: 'CoV', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip />
                  <ReferenceLine y={inputs.targetCoV} stroke="#f43f5e" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="cov" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.05} strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2"><Zap size={18} className="text-amber-400" /><h3 className="font-bold text-sm">Professional AI Audit Report</h3></div>
              <div className="flex gap-2">
                {aiAnalysis && (
                  <button onClick={handleDownloadPDF} className="text-xs font-bold bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 transition-colors shadow-lg flex items-center gap-2 active:scale-95">
                    <FileDown size={14} />
                    Download PDF Report
                  </button>
                )}
                <button onClick={async () => { setIsAnalyzing(true); const res = await getAIRecommendations(inputs, results, guideContent); setAiAnalysis(res); setIsAnalyzing(false); }} className="text-xs font-bold bg-white text-slate-900 px-4 py-1.5 rounded-lg hover:bg-slate-100 transition-colors shadow-lg active:scale-95 disabled:opacity-50" disabled={isAnalyzing}>
                  {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : 'Execute AI Audit'}
                </button>
              </div>
            </div>
            <div className="p-6 bg-white min-h-[200px]">
              {aiAnalysis ? (
                <MarkdownDisplay content={aiAnalysis} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Beaker size={48} className="opacity-10 mb-4" />
                  <p className="text-sm italic">Execute the professional audit for BHR CR 7469 compliance checks.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

const InputGroup = ({ label, value, onChange, highlight }: any) => {
  const [inputValue, setInputValue] = useState(value.toString());
  React.useEffect(() => { setInputValue(value.toString()); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) onChange(parsed);
    else if (val === '') onChange(0);
  };

  return (
    <div className="w-full">
      <label className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 block ${highlight ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</label>
      <input 
        type="text" 
        value={inputValue} 
        onChange={handleChange} 
        className={`w-full border rounded-xl px-3 py-2.5 text-sm font-semibold outline-none transition-all ${highlight ? 'bg-indigo-50 border-indigo-200 focus:ring-2 focus:ring-indigo-400' : 'bg-slate-50 border-slate-200 focus:ring-2 focus:ring-indigo-500'}`} 
      />
    </div>
  );
};

const ResultMetric = ({ title, value, subtitle, highlight = 'slate', icon }: any) => {
  const colors: any = { green: 'bg-green-50 text-green-700 border-green-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', blue: 'bg-blue-50 text-blue-700 border-blue-100', slate: 'bg-white text-slate-900 border-slate-200' };
  return (
    <div className={`p-5 rounded-2xl border shadow-sm ${colors[highlight]} transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{title}</span>
        {icon}
      </div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
      <div className="text-[10px] font-bold mt-1 opacity-60 leading-tight">{subtitle}</div>
    </div>
  );
};

export default App;
