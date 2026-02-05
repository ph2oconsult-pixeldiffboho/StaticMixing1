import { MixingInputs, CalculationResults, ConduitType, ConduitShape, MixerModel, InjectionType, PitchRatio } from './types';

export const calculateMixing = (inputs: MixingInputs): CalculationResults => {
  const { 
    flowRate, dimension, depth = 0.6, conduitType, conduitShape,
    viscosity, density, chemicalDensity, chemicalViscosity,
    chemicalFlow, dilutionWaterFlow, availableLength, targetCoV, targetMixingTime,
    mixerModel, numElements, injectionType, pitchRatio,
    waterTemperature, chemicalDose
  } = inputs;

  const g = 9.81;
  const waterDensity = 1000;
  const waterViscosity = 0.001;

  // 1. Dilution & Injection Properties
  const totalInjectionFlowLh = (chemicalFlow || 0) + (dilutionWaterFlow || 0);
  const totalInjectionFlowM3s = totalInjectionFlowLh / 3600000;
  const x_chem = (chemicalFlow || 0) / (totalInjectionFlowLh || 1);
  const x_water = (dilutionWaterFlow || 0) / (totalInjectionFlowLh || 1);
  
  const injectedDensity = (x_chem * (chemicalDensity || 1000)) + (x_water * waterDensity);
  const injectedViscosity = Math.exp(
    x_chem * Math.log(chemicalViscosity || 1e-6) + 
    x_water * Math.log(waterViscosity || 1e-6)
  );

  // 2. Comprehensive Geometry & Hydraulics
  let area = 0;
  let hydraulicDiameter = 0;

  // Protect against zero inputs
  const d = Math.max(dimension || 0.001, 0.001);
  const h = Math.max(depth || 0.001, 0.001);

  if (conduitType === ConduitType.PIPE) {
    if (conduitShape === ConduitShape.CIRCULAR) {
      area = Math.PI * Math.pow(d / 2, 2);
      hydraulicDiameter = d;
    } else {
      area = d * h;
      hydraulicDiameter = (2 * d * h) / (d + h);
    }
  } else {
    // CHANNEL (Open top)
    area = d * h;
    hydraulicDiameter = (4 * area) / (d + 2 * h);
  }
  
  const Q_m3s = (flowRate || 1) / 3600;
  const velocity = Q_m3s / (area || 1e-6);
  const Re = (density * velocity * hydraulicDiameter) / (viscosity || 1e-6);

  // 3. Momentum Ratio
  const targetMR = 0.22;
  const numPoints = injectionType === InjectionType.TWIN ? 2 : 1;
  const flowPerPointM3s = totalInjectionFlowM3s / numPoints;
  
  const suggestedOrificeDiameter = (4 * flowPerPointM3s * Math.sqrt(injectedDensity / (density || 1))) / 
                                   (Math.PI * targetMR * velocity * hydraulicDiameter || 1e-6);

  const d_inj_default = 0.025; 
  const u_inj_actual = flowPerPointM3s / (Math.PI * Math.pow(d_inj_default / 2, 2) || 1e-9);
  const momentumRatio = Math.sqrt(injectedDensity / (density || 1)) * (u_inj_actual * d_inj_default / (velocity * hydraulicDiameter || 1e-6));
  
  let momentumRegime: 'Low' | 'Intermediate' | 'High' = 'Intermediate';
  if (momentumRatio < 0.16) momentumRegime = 'Low';
  else if (momentumRatio > 0.24) momentumRegime = 'High';

  const alpha = (Q_m3s * 3600000) / (totalInjectionFlowLh || 1);

  // 4. CoV Correlations
  let mixerCoV = 1.0;
  let FD = 0.02; 
  let Lm = 0;
  let manufacturerNotes = "Standard BHR quill recommendations apply.";

  const LD = (availableLength || 1) / hydraulicDiameter;

  switch (mixerModel) {
    case MixerModel.KENICS_KM:
      if (injectionType === InjectionType.SINGLE) {
        mixerCoV = 0.96 * Math.pow(Re, -0.1) * Math.pow(alpha, 0.03) * Math.pow(numElements, -1.9);
      } else {
        mixerCoV = 0.38 * Math.pow(Re, 0.008) * Math.pow(alpha, 0.08) * Math.pow(numElements, -2.1);
      }
      FD = 1.9; 
      Lm = numElements * 1.5 * hydraulicDiameter;
      manufacturerNotes = "Chemineer recommends the quill terminate at 0.5Dh upstream. DH calculated for current geometry.";
      break;
    
    case MixerModel.HEV:
      if (conduitType === ConduitType.CHANNEL) {
        mixerCoV = 60 * Math.pow(LD, -0.6) * Math.pow(numElements, -0.9) * Math.pow(Re, -0.4);
        FD = 0.45;
        Lm = numElements * hydraulicDiameter;
      } else {
        mixerCoV = LD <= 3 
          ? 31.5 * Math.pow(Re, -0.2) * Math.pow(alpha, -0.15) * Math.pow(numElements, -1.7)
          : 1.1 * Math.pow(Re, -0.04) * Math.pow(alpha, 0.02) * Math.pow(numElements, -1.9);
        FD = 0.6;
        Lm = numElements * hydraulicDiameter;
      }
      manufacturerNotes = "HEV tabs work best when injection is centered relative to the DH axis.";
      break;

    case MixerModel.SMV:
      mixerCoV = 0.3 * Math.pow(Re, -0.02) * Math.pow(alpha, -0.01) * Math.pow(numElements, -1.6);
      FD = 10.1; 
      Lm = numElements * hydraulicDiameter;
      manufacturerNotes = "Sulzer SMV is high-performance; initial distribution is critical for short conduits.";
      break;

    case MixerModel.STM:
      if (conduitType === ConduitType.CHANNEL) {
        if (pitchRatio === PitchRatio.PR_1_125) {
          mixerCoV = 2.10e-4 * Math.pow(LD, -0.2) * Math.pow(numElements, -0.3) * Math.pow(alpha, -0.02) * Math.pow(Re, 0.7);
          FD = 3.0;
        } else if (pitchRatio === PitchRatio.PR_1_5) {
          mixerCoV = 0.29 * Math.pow(LD, -0.07) * Math.pow(numElements, -0.25) * Math.pow(alpha, 0.1) * Math.pow(Re, -0.2);
          FD = 7.6;
        } else {
          mixerCoV = 48 * Math.pow(LD, -0.2) * Math.pow(numElements, -0.2) * Math.pow(alpha, 0.7) * Math.pow(Re, -1.1);
          FD = 1.9;
        }
        Lm = numElements * 0.5 * hydraulicDiameter;
      } else {
        mixerCoV = pitchRatio === PitchRatio.PR_1_5 
          ? 0.29 * Math.pow(Re, -0.2) * Math.pow(alpha, 0.09) * Math.pow(numElements, -0.6)
          : 0.28 * Math.pow(Re, -0.04) * Math.pow(alpha, 0.10) * Math.pow(numElements, -2.1);
        FD = pitchRatio === PitchRatio.PR_1_5 ? 4.15 : 2.3;
        Lm = numElements * 0.8 * hydraulicDiameter;
      }
      break;

    case MixerModel.NONE:
    default:
      FD = 0.25 / Math.pow(Math.log10(0.0001 / (3.7 * hydraulicDiameter) + 5.74 / Math.pow(Re, 0.9)), 2);
      Lm = availableLength || 0.1;
      if (conduitType === ConduitType.CHANNEL) {
        const mrSafe = Math.max(0.01, momentumRatio);
        mixerCoV = 0.0183 * Math.pow(LD, -1/1.3) * Math.pow(mrSafe, -2.21/1.3);
      } else {
        const CoVi = Math.sqrt(alpha);
        mixerCoV = 2 * CoVi * Math.exp(-0.75 * Math.sqrt(FD) * LD);
      }
      break;
  }

  mixerCoV = isNaN(mixerCoV) ? 1.0 : Math.min(1.0, Math.max(0.0001, mixerCoV));

  // 5. Headloss & G-Value
  const headlossMeters = (mixerModel === MixerModel.WEIR) ? 0.15 : (FD * Lm * Math.pow(velocity, 2)) / (2 * g * hydraulicDiameter);
  const headlossKpa = (headlossMeters * density * g) / 1000;
  const powerDissipated = headlossKpa * 1000 * Q_m3s;
  const volForG = area * Math.max(Lm, hydraulicDiameter);
  const gValue = Math.sqrt(powerDissipated / (viscosity * volForG || 1e-9));

  // 6. Dissolution (Lime)
  const limeSaturationLimit = (-0.00004 * Math.pow(waterTemperature, 2) - 0.0125 * waterTemperature + 1.83) * 1000;
  const rateK = 0.3 * Math.sqrt(Math.max(1, gValue) / 100) * Math.max(0.1, (limeSaturationLimit - (chemicalDose || 0)) / limeSaturationLimit);
  const timeTo95 = Math.log(1 / 0.05) / (rateK || 1e-3);
  const distanceTo95 = timeTo95 * velocity;

  // 7. Overall Required Distance
  const decayRate = conduitType === ConduitType.PIPE ? 0.75 * Math.sqrt(0.02) : 0.6;
  const tCoV = targetCoV || 0.05;
  let mixingDistanceNeeded = mixerCoV <= tCoV ? Lm : Lm + (Math.log(mixerCoV / tCoV) / (decayRate || 0.1)) * hydraulicDiameter;
  
  const finalDistanceNeeded = inputs.chemicalType.includes('Lime') ? Math.max(mixingDistanceNeeded, distanceTo95) : mixingDistanceNeeded;
  const mixingTimeNeeded = finalDistanceNeeded / (velocity || 1e-6);
  const dissolvedAtTarget = (1 - Math.exp(-rateK * mixingTimeNeeded)) * 100;

  return {
    velocity,
    reynoldsNumber: Re,
    momentumRatio,
    momentumRegime,
    naturalMixingCoV: 1.0, 
    mixerCoV,
    viscosityRatio: injectedViscosity / (viscosity || 1e-6),
    injectedViscosity,
    injectedDensity,
    totalInjectionFlow: totalInjectionFlowLh,
    isCompliant: (mixerCoV <= tCoV) && (!inputs.chemicalType.includes('Lime') || dissolvedAtTarget > 90),
    isTimeCompliant: mixingTimeNeeded <= targetMixingTime,
    mixingDistanceNeeded: finalDistanceNeeded,
    mixingTimeNeeded,
    headloss: headlossKpa,
    headlossMeters,
    gValue,
    limeSaturationLimit,
    dissolvedAtTarget: Math.min(100, dissolvedAtTarget),
    timeTo95Dissolution: timeTo95,
    distanceTo95Dissolution: distanceTo95,
    suggestedOrificeDiameter: suggestedOrificeDiameter * 1000,
    manufacturerNotes,
    hydraulicDiameter,
    wettedArea: area
  };
};
