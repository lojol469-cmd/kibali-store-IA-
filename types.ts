
export interface ModelInfo {
  Nom: string;
  Chemin: string;
  Taille: string;
  Statut: string;
  Type: string;
  PyTorch: string;
  TF: string;
  CUDA: string;
  StandardHF: string;
  RepoID: string;
}

export interface Diagnostics {
  CPU?: Record<string, any>;
  RAM?: Record<string, any>;
  "GPU/CUDA"?: Record<string, any>;
  "Conseil RAM"?: string;
  "Conseil GPU"?: string;
}

export interface SearchResult {
  id: string;
  author: string;
  tags: string[];
  downloads: number;
  is_standard: boolean;
}

export interface TestResult {
  Nom: string;
  Type: string;
  Fonctionnel: string;
  Détails: string;
}
