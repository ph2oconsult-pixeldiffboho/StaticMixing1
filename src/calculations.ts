import {
  MixingInputs,
  CalculationResults,
  ConduitShape,
  ConduitType,
  InjectionType,
  MixerModel
} from "./types";

export function calculateMixing(inputs: MixingInputs): CalculationResults {
  // ===== BASIC HYDRAULICS =====
  const area =
    inputs.conduitShape === ConduitShape.CIRCULAR
      ? Math.PI * Math.pow(inputs.dimension / 2, 2)
      : Math.max(1e-6, inputs.dimension * Math.max(inputs.depth, 1e-6));

  const flow_m3s = inputs.flowRate / 3600;
  const velocity = flow_m3s / Math.max(area, 1e-6);

  const hydraulicDiameter =
    inputs.conduitShape === ConduitShape.CIRCULAR
      ? inputs.dimension
      : (2 * inputs.dimension * Math.max(inputs.depth, 1e-6)) /
        Math.max(inputs.dimension + Math.max(inputs.depth, 1e-6), 1e-6);

  const reynoldsNumber =
    (inputs.density * velocity * hydraulicDiameter) /
    Math.max(inputs.viscosity, 1e-9);

  // ===== MIXING MODEL (PLACEHOLDER BUT CONSISTENT) =====
  const baseCoV =
    inputs.mixerModel === MixerModel.NONE ? 0.12 : 0.03;

  const injectionFactor =
    inputs.injectionType === InjectionType.TWIN ? 0.85 : 1.0;

  const mixerCoV = Math.max(0.001, baseCoV * injectionFactor);

  const decay =
    inputs.conduitType === ConduitType.PIPE ? 0.9 : 0.6;

  const mixingDistanceNeeded =
    Math.max(
      0.1,
      (hydraulicDiameter *
        Math.log(mixerCoV / Math.max(inputs.targetCoV, 1e-6))) /
        Math.max(decay, 1e-6)
    );

  const mixingTimeNeeded =
    mixingDistanceNeeded / Math.max(velocity, 1e-6);

  const isCompliant = mixerCoV <= inputs.targetCoV;
  const isTimeCompliant =
    mixingTimeNeeded <= inputs.targetMixingTime;

  // ===== HEADLOSS & ENERGY =====
  const headloss =
    inputs.mixerModel === MixerModel.NONE
      ? 0.5
      : 8 + 1.5 * Math.max(0, inputs.numElements - 1);

  const headlossMeters = headloss / 9.81;
  const gValue = Math.min(2000, Math.max(10, velocity * 500));

  // ===== INJECTION HARDWARE =====
  const totalInjectionFlow =
    inputs.chemicalFlow + inputs.dilutionWaterFlow;

  const suggestedOrificeDiameter =
    inputs.injectionType === InjectionType.TWIN ? 6 : 8;

  const manufacturerNotes =
    inputs.mixerModel === MixerModel.NONE
      ? "Natural mixing: ensure sufficient straight length and avoid short-circuiting."
      : "Static mixer installed per manufacturer orientation and spacing guidance.";

  // ===== MOMENTUM =====
  const momentumRatio = 0.22;
  const momentumRegime = "Target";

  // ===== LIME PLACEHOLDERS =====
  const limeSaturationLimit = 150;
  const dissolvedAtTarget = 95;
  const timeTo95Dissolution =
    Math.max(1, mixingTimeNeeded * 0.8);
  const distanceTo95Dissolution =
    timeTo95Dissolution * Math.max(velocity, 1e-6);

  return {
    mixerCoV,
    mixingDistanceNeeded,
    mixingTimeNeeded,
    isCompliant,
    isTimeCompliant,
    headloss,
    headlossMeters,
    gValue,
    hydraulicDiameter,
    velocity,
    reynoldsNumber,
    totalInjectionFlow,
    suggestedOrificeDiameter,
    manufacturerNotes,
    momentumRatio,
    momentumRegime,
    limeSaturationLimit,
    timeTo95Dissolution,
    distanceTo95Dissolution,
    dissolvedAtTarget
  };
}
