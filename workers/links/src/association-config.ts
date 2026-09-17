export type AppleAssociation = {
  appIDs: string[];
  components: Array<Record<string, string>>;
};
export type AndroidAssociation = {
  packageName: string;
  sha256CertFingerprints: string[];
};

// Este archivo se versiona deliberadamente. Los valores reales se añaden al
// preparar cada app; el repositorio nunca contiene IDs privados ni certificados.
export const associationConfig: {
  android: AndroidAssociation[];
  apple: AppleAssociation[];
  version: 1;
} = {
  android: [],
  apple: [],
  version: 1,
};
