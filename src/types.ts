// =======================
// ENUMS
// =======================

export enum ConduitType {
  PIPE = "PIPE",
  CHANNEL = "CHANNEL"
}

export enum ConduitShape {
  CIRCULAR = "CIRCULAR",
  RECTANGULAR = "RECTANGULAR"
}

export enum MixerModel {
  NONE = "NONE",
  KENICS_KM = "KENICS_KM",
  HEV = "HEV",
  SMV = "SMV",
  STM = "STM",
  BAFFLES = "BAFFLES",
  WEIR = "WEIR"
}

export enum InjectionType {
  SINGLE = "SINGLE",
  TWIN = "TWIN"
}

export enum PitchRatio {
  PR_1_125 = "1.125",
  PR_1_5 = "1.5",
  PR_2_25 = "2.25"
}

// =======================
// INPUTS
// =======================

export interface MixingInputs {
  conduitType: ConduitType;
  conduitShape: ConduitShape;
  mixerModel: MixerModel;

  numElements: number;

  flowRate: number; // m³/h
  dimension: number; // diameter or width (m)
  depth?: number; // depth / height (m)
  availableLength: number; // m

  viscosity: number; // Pa·s
  density: number; // kg/m³

  chemicalType: string;
  chemicalDose?: number; // mg/L
  chemicalFlow: number; // L/h
  chemicalDensity: number; // kg/m³
  chemicalViscosity: number; // Pa·s

  dilutionWaterFlow: number; // L/h

  targetCoV: number;
  targetMixingTime: number; // s

  slurryConcentration?: number; // %
  injectionType: InjectionType;
  pitchRatio: PitchRatio;

  waterTemperature: number; // °C
}

// =======================
// RESULTS
// =======================

export interface CalculationResults {
  // Hydraulics
  velocity: number; // m/s
  reynoldsNumber: number;
  hydraulicDiameter: number; // m
  wettedArea?: number; // m²

  // Mixing performance
  mixerCoV: number;
  naturalMixingCoV?: number;
  mixingDistanceNeeded: number; // m
  mixingTimeNeeded: number; // s

  isCompliant: boolean;
  isTimeCompliant: boolean;

  // Energy / loss
  headloss: number; // kPa
  headlossMeters: number; // m
  gValue: number; // s⁻¹

  // Injection hydraulics
  totalInjectionFlow: number; // L/h
  suggestedOrificeDiameter: number; // mm
  injectedViscosity?: number; // Pa·s
  injectedDensity?: number; // kg/m³
  viscosityRatio?: number;

  momentumRatio: number;
  momentumRegime: string;

  // Lime / dissolution
  limeSaturationLimit: number; // mg/L
  dissolvedAtTarget: number; // %
  timeTo95Dissolution: number; // s
  distanceTo95Dissolution: number; // m

  // Guidance
  manufacturerNotes: string;
}
