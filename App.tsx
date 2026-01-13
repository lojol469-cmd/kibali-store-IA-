import React, { useState, useEffect, useCallback } from 'react';
import { 
  Cpu, 
  HardDrive, 
  Search, 
  Trash2, 
  RefreshCw, 
  Download, 
  ShieldCheck, 
  Activity, 
  Terminal,
  Layers,
  Info,
  Zap,
  Globe,
  Code,
  X,
  CheckCircle,
  AlertTriangle,
  Copy,
  Eraser, 
  FileCode,
  LucideIcon
} from 'lucide-react';

// --- TYPES EXACTS BACKEND V3 ---
export interface ModelInfo {
  nom: string;
  repo_id: string;
  chemin: string;
  taille_fmt: string;
  taille_bytes: number;
  statut: string;
  type: string;
  pytorch: boolean;
  tf: boolean;
  cuda_compatible: boolean;
  standard_hf: boolean;
  custom_files: string[];
}

export interface Diagnostics {
  CPU: Record<string, any>;
  RAM: Record<string, any>;
  "GPU/CUDA": Record<string, any>;
  "Conseil RAM"?: string;
  "Conseil GPU"?: string;
}

export interface SearchResult {
  id: string;
  author: string;
  downloads: number;
  is_standard: boolean;
  tags: string[];
  likes: number;
  pipeline_tag?: string;
}

export interface SnippetResponse {
  code: string;
  description: string;
  is_standard: boolean;
}

export interface VerifyResponse {
  repo_id: string;
  fonctionnel: boolean;
  details: string;
  path?: string;
}

const API_BASE = "http://localhost:8000";

const App: React.FC = () => {
  // --- ETATS ---
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [activeTab, setActiveTab] = useState<'inventory' | 'discover' | 'system'>('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modales
  const [snippetData, setSnippetData] = useState<SnippetResponse | null>(null);
  const [verifyData, setVerifyData] = useState<VerifyResponse | null>(null);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  // --- API FETCH HELPER ---
  const apiFetch = async (endpoint: string, options?: RequestInit) => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options?.headers }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail || `Erreur API: ${res.status}`);
      }
      return await res.json();
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  // --- CHARGEMENT DONNÉES ---
  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setLoadingMessage("Scan des modèles locaux...");
    try {
      const data = await apiFetch("/models");
      setModels(data);
    } catch (err) {
      setError("Backend indisponible. Vérifiez que 'main.py' est lancé.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    try {
      const data = await apiFetch("/diagnostics");
      setDiagnostics(data);
    } catch (err) { /* Silent fail for polling */ }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 5000);
    return () => clearInterval(interval);
  }, [fetchModels, fetchDiagnostics]);

  // --- HANDLERS (ACTIONS) ---

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsLoading(true);
    setLoadingMessage(`Exploration Hugging Face pour "${searchQuery}"...`);
    try {
      const data = await apiFetch(`/models/search`, {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery, limit: 12 })
      });
      setSearchResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (repoId: string) => {
    setIsLoading(true);
    setLoadingMessage(`Analyse de ${repoId}...`);
    try {
      // 1. Analyse préalable
      const check = await apiFetch("/models/check-remote", {
        method: 'POST',
        body: JSON.stringify({ repo_id: repoId })
      });

      let confirmMsg = `Télécharger ${repoId} ?`;
      if (!check.is_standard) {
        confirmMsg = `⚠️ ATTENTION: ${repoId} est un modèle CUSTOM.\nIl contient des fichiers Python spécifiques : ${check.custom_files.join(", ")}.\n\nSon utilisation demandera du code manuel.\nContinuer ?`;
      } else if (check.custom_files && check.custom_files.length > 0) {
        confirmMsg = `ℹ️ Note : ${repoId} est Standard mais contient du code custom (${check.custom_files.length} fichiers).\nIl faudra utiliser trust_remote_code=True.\nContinuer ?`;
      }

      if (!confirm(confirmMsg)) {
        setIsLoading(false);
        return;
      }

      // 2. Download
      setLoadingMessage("Démarrage du téléchargement optimisé (Aria2)...");
      await apiFetch("/models/download", {
        method: 'POST',
        body: JSON.stringify({ repo_id: repoId })
      });
      
      alert("Téléchargement lancé en arrière-plan.");
      setActiveTab('inventory');
      fetchModels(); 

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (repoId: string) => {
    if (!confirm(`Supprimer ${repoId} ? Cette action est irréversible.`)) return;
    setIsLoading(true);
    try {
      await apiFetch("/models", {
        method: 'DELETE',
        body: JSON.stringify({ repo_id: repoId })
      });
      await fetchModels();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSnippet = async (repoId: string) => {
    setIsLoading(true);
    try {
      const data = await apiFetch("/models/snippet", {
        method: 'POST',
        body: JSON.stringify({ repo_id: repoId })
      });
      setSnippetData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (repoId: string) => {
    setIsLoading(true);
    setLoadingMessage("Vérification d'intégrité...");
    try {
      const data = await apiFetch("/models/verify", {
        method: 'POST',
        body: JSON.stringify({ repo_id: repoId })
      });
      setVerifyData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ DÉFINITION DE HANDLE CLEANUP AVANT LE JSX
  const handleCleanup = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/system/cleanup?type=incomplete", { method: 'POST' });
      alert(`Nettoyage terminé : ${res.count} dossiers supprimés.`);
      fetchModels();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setShowCleanupConfirm(false);
    }
  };

  // --- JSX RENDER ---

  const Logo = () => (
    <div className="flex items-center gap-3 py-4">
      <div className="bg-linear-to-br from-blue-600 to-indigo-700 p-2.5 rounded-xl shadow-xl shadow-blue-500/20 ring-1 ring-white/20">
        <Zap className="w-7 h-7 text-white fill-white" />
      </div>
      <div>
        <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-linear-to-r from-white to-blue-400">
          KIBALI IA STORE
        </h1>
        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] leading-none">
          Hub Manager Pro
        </p>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 pb-20 selection:bg-blue-500/30 font-sans text-slate-200">
      
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 mb-8 px-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Logo />
        <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/5">
          {[
            { id: 'inventory', label: 'Inventaire', icon: Layers },
            { id: 'discover', label: 'Découverte', icon: Globe },
            { id: 'system', label: 'Système', icon: Activity },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all text-sm font-bold ${
                activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 text-sm animate-in fade-in zoom-in-95">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-medium flex-1">{error}</span>
          <button onClick={() => setError(null)} className="underline hover:text-white">Fermer</button>
        </div>
      )}

      <main className="min-h-[60vh]">
        
        {/* === INVENTORY === */}
        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  <HardDrive className="text-blue-500 w-7 h-7" /> Modèles Installés
                </h2>
                <p className="text-slate-500 text-sm">{models.length} modèles détectés localement</p>
              </div>
              <button onClick={fetchModels} className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                <RefreshCw className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {models.length === 0 && !isLoading && (
                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
                  <Layers className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Aucun modèle installé.</p>
                  <button onClick={() => setActiveTab('discover')} className="mt-4 text-blue-400 font-bold hover:underline">
                    Aller à la découverte
                  </button>
                </div>
              )}

              {models.map((model) => (
                <div key={model.chemin} className="bg-slate-900/50 p-6 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all relative overflow-hidden group">
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${model.statut === 'Complet' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  
                  <div className="flex flex-col lg:flex-row justify-between gap-6 pl-4">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-linear-to-br from-slate-800 to-slate-900 rounded-2xl flex items-center justify-center text-slate-400 border border-white/5 shadow-inner">
                          {model.custom_files.length > 0 ? <FileCode className="w-6 h-6 text-amber-400" /> : <Layers className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-black text-xl text-white truncate">{model.nom}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500 font-mono bg-black/30 px-2 py-0.5 rounded truncate max-w-md">
                              {model.repo_id}
                            </span>
                            {model.standard_hf ? (
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-bold border border-indigo-500/20">STANDARD HF</span>
                            ) : (
                              <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-bold border border-rose-500/20 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> CUSTOM
                              </span>
                            )}
                            {model.custom_files.length > 0 && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-bold border border-amber-500/20">
                                {model.custom_files.length} scripts .py
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Badge label={model.taille_fmt} variant="slate" icon={HardDrive} />
                        <Badge label={model.statut} variant={model.statut === 'Complet' ? 'emerald' : 'amber'} />
                        {model.pytorch && <Badge label="PyTorch" variant="blue" />}
                        {model.cuda_compatible && <Badge label="CUDA" variant="emerald" icon={Zap} />}
                      </div>
                    </div>

                    <div className="flex flex-row lg:flex-col gap-2 justify-center">
                      <button onClick={() => handleSnippet(model.repo_id)} className="px-4 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                        <Code className="w-4 h-4" /> CODE
                      </button>
                      <button onClick={() => handleVerify(model.repo_id)} className="px-4 py-2 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> VÉRIFIER
                      </button>
                      <button onClick={() => handleDelete(model.repo_id)} className="px-4 py-2 bg-rose-500/5 text-rose-500 border border-rose-500/20 hover:bg-rose-600 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                        <Trash2 className="w-4 h-4" /> SUPPRIMER
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === DISCOVER === */}
        {activeTab === 'discover' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-linear-to-br from-slate-900 to-slate-950 p-10 rounded-[2.5rem] border border-white/5 shadow-2xl text-center">
              <h2 className="text-3xl font-black text-white mb-2">Catalogue Hugging Face</h2>
              <div className="relative max-w-2xl mx-auto group mt-6">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 w-6 h-6 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Rechercher (ex: mistral, bert, diffusion...)"
                  className="w-full pl-14 pr-32 py-4 bg-slate-950 border-2 border-slate-800 rounded-2xl focus:border-blue-600 outline-none text-white text-lg transition-all"
                />
                <button onClick={handleSearch} className="absolute right-2 top-2 bottom-2 px-6 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold">
                  Chercher
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchResults.map((res) => (
                <div key={res.id} className="bg-slate-900 p-6 rounded-3xl border border-white/5 flex flex-col hover:ring-2 hover:ring-blue-500/50 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold text-slate-400">
                      {res.downloads.toLocaleString()} DLs
                    </span>
                    {res.is_standard ? (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20 font-bold">HF STD</span>
                    ) : (
                      <span className="text-[9px] bg-rose-500/10 text-rose-400 px-2 py-1 rounded border border-rose-500/20 font-bold">CUSTOM</span>
                    )}
                  </div>
                  
                  <h4 className="font-bold text-lg text-white mb-1 wrap-break-word">{res.id}</h4>
                  <p className="text-xs text-slate-500 mb-4">{res.pipeline_tag || "Autre"}</p>
                  
                  <div className="flex flex-wrap gap-1 mb-6 flex-1 content-start">
                    {res.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[9px] bg-slate-800 text-slate-400 px-2 py-1 rounded-full border border-white/5">{tag}</span>
                    ))}
                  </div>

                  <button onClick={() => handleDownload(res.id)} className="w-full py-3 bg-white text-slate-900 hover:bg-blue-600 hover:text-white rounded-xl font-black transition-all flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> INSTALLER
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === SYSTEM === */}
        {activeTab === 'system' && diagnostics && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <SysCard title="CPU" icon={Cpu} variant="blue" data={diagnostics.CPU} />
              <SysCard title="RAM" icon={Activity} variant="emerald" data={diagnostics.RAM} advice={diagnostics["Conseil RAM"]} />
              <SysCard title="GPU" icon={Zap} variant="purple" data={diagnostics["GPU/CUDA"]} advice={diagnostics["Conseil GPU"]} />
            </div>
            
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Nettoyage du Cache</h3>
                <p className="text-slate-400 text-sm">Supprime les fichiers temporaires et téléchargements échoués.</p>
              </div>
              <button onClick={() => setShowCleanupConfirm(true)} className="px-6 py-3 bg-slate-800 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/20 rounded-xl font-bold flex items-center gap-2 transition-all">
                <Eraser className="w-5 h-5" /> Nettoyer
              </button>
            </div>
          </div>
        )}
      </main>

      {/* MODALES */}
      {snippetData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-800">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-400" /> Intégration Python
              </h3>
              <button onClick={() => setSnippetData(null)}><X className="w-6 h-6 text-slate-400 hover:text-white" /></button>
            </div>
            <div className="p-6">
              <div className={`text-sm mb-4 font-bold flex items-center gap-2 ${snippetData.is_standard ? 'text-emerald-400' : 'text-amber-400'}`}>
                {snippetData.is_standard ? <CheckCircle className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
                {snippetData.description}
              </div>
              <div className="relative group">
                <pre className="bg-black/50 p-4 rounded-xl text-sm font-mono text-slate-300 overflow-x-auto border border-white/5">
                  {snippetData.code}
                </pre>
                <button onClick={() => navigator.clipboard.writeText(snippetData.code)} className="absolute top-2 right-2 p-2 bg-slate-700 rounded-lg hover:bg-white/20 transition-all">
                  <Copy className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VERIFY */}
      {verifyData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-md rounded-3xl border border-white/10 shadow-2xl animate-in zoom-in-95 text-center p-8">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${verifyData.fonctionnel ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
              {verifyData.fonctionnel ? <CheckCircle className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
            </div>
            <h3 className="text-xl font-black text-white mb-2">{verifyData.fonctionnel ? "Intègre" : "Erreur"}</h3>
            <p className="text-slate-400 text-sm mb-6">{verifyData.details}</p>
            <button onClick={() => setVerifyData(null)} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold w-full">Fermer</button>
          </div>
        </div>
      )}

      {/* LOADER */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center">
          <RefreshCw className="w-16 h-16 text-blue-500 animate-spin mb-6" />
          <p className="text-white font-black animate-pulse">{loadingMessage}</p>
        </div>
      )}

      {/* CLEANUP CONFIRM */}
      {showCleanupConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 max-w-sm w-full p-6 rounded-3xl border border-rose-500/30">
            <h3 className="text-xl font-bold text-white mb-4">Confirmer le nettoyage ?</h3>
            <div className="flex gap-3">
              <button onClick={() => setShowCleanupConfirm(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-white font-bold">Non</button>
              <button onClick={() => { handleCleanup(); setShowCleanupConfirm(false); }} className="flex-1 py-3 bg-rose-600 rounded-xl text-white font-bold">Oui</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// --- HELPERS ---
const Badge = ({ label, variant, icon: Icon }: { label: string, variant: string, icon?: LucideIcon }) => {
  const styles: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    slate: 'bg-white/5 text-slate-400 border-white/5'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] uppercase font-black tracking-wider border ${styles[variant]}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
};

const SysCard = ({ title, icon: Icon, variant, data, advice }: { title: string, icon: LucideIcon, variant: string, data: any, advice?: string }) => {
  const colors: Record<string, any> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' }
  };
  return (
    <div className="bg-slate-900/60 border border-white/5 p-6 rounded-3xl">
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl ${colors[variant].bg} ${colors[variant].text}`}><Icon className="w-6 h-6" /></div>
        <h3 className="font-black text-lg text-white">{title}</h3>
      </div>
      <div className="space-y-2">
        {Object.entries(data || {}).map(([k, v]: any) => (
          <div key={k} className="flex justify-between text-sm border-b border-white/5 pb-1 last:border-0">
            <span className="text-slate-500 font-bold uppercase text-xs">{k}</span>
            <span className="text-white font-mono">{v}</span>
          </div>
        ))}
        {advice && (
          <div className={`mt-2 pt-2 border-t border-dashed border-white/10 ${colors[variant].text} text-xs font-bold flex items-center gap-2`}>
            <Info className="w-3 h-3" /> {advice}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;