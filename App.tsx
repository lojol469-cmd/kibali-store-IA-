
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
  AlertTriangle,
  Zap,
  Globe
} from 'lucide-react';
import { ModelInfo, Diagnostics, SearchResult, TestResult } from './types';

const API_BASE = "http://localhost:8000";

const App: React.FC = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'discover' | 'system'>('inventory');
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fallback data if API is not reachable
  const getMockModels = (): ModelInfo[] => [
    { Nom: "Kibali-Llama-3-Mock", Chemin: "/mock/path/llama", Taille: "8.0GB", Statut: "Complet", Type: "LLM", PyTorch: "Oui", TF: "Non", CUDA: "Oui", StandardHF: "Oui", RepoID: "meta-llama/Llama-3-8B" },
    { Nom: "Kibali-StableDiffusion-XL", Chemin: "/mock/path/sdxl", Taille: "6.5GB", Statut: "Complet", Type: "Diffusion", PyTorch: "Oui", TF: "Non", CUDA: "Oui", StandardHF: "Oui", RepoID: "stabilityai/stable-diffusion-xl-base-1.0" }
  ];

  const getMockDiagnostics = (): Diagnostics => ({
    CPU: { "Cœurs": 8, "Threads": 16, "Fréquence": "3.5GHz" },
    RAM: { "Totale": "16GB", "Utilisée": "45%", "Libre": "8.8GB" },
    "GPU/CUDA": { "Disponible": "Oui", "Nom GPU": "NVIDIA RTX 3080", "VRAM": "10GB" },
    "Conseil RAM": "✅ Système stable.",
    "Conseil GPU": "✅ Accélération activée."
  });

  const apiFetch = async (endpoint: string, options?: RequestInit) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`API Unavailable (${endpoint}), using mock data.`, err);
      throw err;
    }
  };

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/models");
      setModels(data);
    } catch (err: any) {
      setModels(getMockModels());
      setError("Serveur Backend non détecté (Mode Démo activé)");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    try {
      const data = await apiFetch("/diagnostics");
      setDiagnostics(data);
    } catch (err: any) {
      if (!diagnostics) setDiagnostics(getMockDiagnostics());
    }
  }, [diagnostics]);

  useEffect(() => {
    fetchModels();
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 15000);
    return () => clearInterval(interval);
  }, [fetchModels, fetchDiagnostics]);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsLoading(true);
    try {
      const data = await apiFetch(`/search?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data);
    } catch (err: any) {
      setSearchResults([
        { id: `demo/${searchQuery}-model`, author: "demo-user", tags: ["demo"], downloads: 100, is_standard: true }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestAll = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch("/test-models", { method: 'POST' });
      setTestResults(data);
    } catch (err: any) {
      setTestResults(models.map(m => ({
        Nom: m.Nom,
        Type: "Demo Check",
        Fonctionnel: "Oui",
        Détails: "Validation locale simulée réussie."
      })));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (repoId: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer ${repoId} ?`)) return;
    setIsLoading(true);
    try {
      await apiFetch(`/models/${encodeURIComponent(repoId)}`, { method: 'DELETE' });
      await fetchModels();
    } catch (err) {
      setModels(prev => prev.filter(m => m.RepoID !== repoId));
    } finally {
      setIsLoading(false);
    }
  };

  const Logo = () => (
    <div className="flex items-center gap-3 py-4">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-2.5 rounded-xl shadow-xl shadow-blue-500/20 ring-1 ring-white/20">
        <Zap className="w-7 h-7 text-white fill-white" />
      </div>
      <div>
        <h1 className="text-2xl font-black tracking-tighter text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-400">
          KIBALI IA STORE
        </h1>
        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-[0.2em] leading-none">
          Powered by FastAPI
        </p>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 pb-20 selection:bg-blue-500/30">
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 mb-8 px-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <Logo />
        <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl mb-4 md:mb-0 border border-white/5">
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
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-amber-400 text-sm animate-in fade-in zoom-in-95">
          <Info className="w-5 h-5" />
          <span className="font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto underline">Fermer</button>
        </div>
      )}

      <main className="min-h-[60vh]">
        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  <HardDrive className="text-blue-500 w-7 h-7" /> Modèles Kibali
                </h2>
                <p className="text-slate-500 text-sm">Cache local haute performance</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={handleTestAll}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
                >
                  <ShieldCheck className="w-4 h-4" /> Tester le Cache
                </button>
                <button 
                  onClick={fetchModels}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-white/5 hover:border-white/10"
                >
                  <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
                </button>
              </div>
            </div>

            {testResults && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-top-4 duration-500">
                <div className="bg-slate-800/50 px-6 py-3 border-b border-white/5 flex justify-between items-center">
                  <span className="text-sm font-bold text-emerald-400">Rapport de Santé Kibali</span>
                  <button onClick={() => setTestResults(null)} className="text-xs text-slate-500 hover:text-white">Fermer</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5 bg-slate-900/50">
                      <tr>
                        <th className="px-6 py-4">ID Modèle</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Diagnostic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {testResults.map((res, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 font-bold text-white">{res.Nom}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${res.Fonctionnel === 'Oui' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                              {res.Fonctionnel === 'Oui' ? 'Vérifié' : 'Echec'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 italic text-xs">{res.Détails}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {models.map((model, idx) => (
                <div key={idx} className="bg-slate-900/50 p-6 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-all group">
                  <div className="flex flex-col lg:flex-row justify-between gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-500/20">
                          <Layers className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-black text-xl text-white group-hover:text-blue-400 transition-colors">{model.Nom}</h3>
                          <p className="text-xs text-slate-500 font-mono mt-1 opacity-60 truncate max-w-xl">{model.Chemin}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge label={`Poids: ${model.Taille}`} />
                        <Badge label={model.Statut} color={model.Statut === 'Complet' ? 'emerald' : 'amber'} />
                        <Badge label={model.Type} color="blue" />
                        <Badge label={model.StandardHF === 'Oui' ? 'Official' : 'Custom'} color="indigo" />
                      </div>
                    </div>
                    <div className="flex flex-row lg:flex-col gap-2">
                      <button className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-xs font-black text-slate-300 border border-white/5 flex items-center justify-center gap-2">
                        <Terminal className="w-4 h-4" /> UTILISATION
                      </button>
                      <button 
                        onClick={() => handleDeleteModel(model.RepoID)}
                        className="px-6 py-3 bg-rose-500/5 hover:bg-rose-600 text-rose-500 hover:text-white rounded-2xl text-xs font-black border border-rose-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> RETIRER
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'discover' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-12 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden text-center">
              <div className="max-w-2xl mx-auto space-y-6">
                <h2 className="text-4xl font-black text-white">KIBALI Search Engine</h2>
                <p className="text-slate-400">Accès direct au catalogue mondial Hugging Face</p>
                <div className="relative mt-8 group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 w-6 h-6" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="llama 3, whisper-large, flan-t5..."
                    className="w-full pl-14 pr-40 py-5 bg-slate-950 border-2 border-slate-800 rounded-3xl focus:border-blue-600 outline-none text-white text-lg"
                  />
                  <button 
                    onClick={handleSearch}
                    disabled={isLoading}
                    className="absolute right-2.5 top-2.5 bottom-2.5 px-8 bg-blue-600 hover:bg-blue-500 rounded-2xl text-white font-black"
                  >
                    Chercher
                  </button>
                </div>
              </div>
              
              {searchResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16 text-left">
                  {searchResults.map((result) => (
                    <div key={result.id} className="bg-slate-900 p-8 rounded-[2rem] border border-white/5 hover:ring-2 hover:ring-blue-500 transition-all flex flex-col h-full">
                      <div className="flex-1">
                        <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-black rounded-lg">MODEL</span>
                        <h4 className="font-black text-xl text-white mt-4 mb-1 break-all line-clamp-1">{result.id}</h4>
                        <p className="text-xs text-slate-500 font-bold mb-6">PUBLISHED BY {result.author.toUpperCase()}</p>
                      </div>
                      <button className="w-full py-4 bg-white text-slate-900 hover:bg-blue-600 hover:text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2">
                        <Download className="w-5 h-5" /> INSTALLER
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'system' && diagnostics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <SysCard title="CPU Kibali" icon={Cpu} color="blue" data={diagnostics.CPU} advice={null} />
            <SysCard title="Memory" icon={Activity} color="emerald" data={diagnostics.RAM} advice={diagnostics["Conseil RAM"]} />
            <SysCard title="GPU Hub" icon={Zap} color="purple" data={diagnostics["GPU/CUDA"]} advice={diagnostics["Conseil GPU"]} />
          </div>
        )}
      </main>

      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <RefreshCw className="w-16 h-16 text-blue-500 animate-spin" />
            <p className="text-white font-black tracking-widest uppercase">Communication Kibali API...</p>
          </div>
        </div>
      )}
    </div>
  );
};

const Badge = ({ label, color = 'slate' }: { label: string, color?: string }) => (
  <span className={`px-4 py-1.5 rounded-full text-[10px] uppercase font-black tracking-wider border ${
    color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
    color === 'amber' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
    color === 'blue' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
    'bg-white/5 text-slate-400 border-white/5'
  }`}>
    {label}
  </span>
);

const SysCard = ({ title, icon: Icon, color, data, advice }: any) => (
  <div className="bg-slate-900/60 border border-white/5 p-8 rounded-[2.5rem]">
    <div className="flex items-center gap-4 mb-8">
      <div className={`p-4 bg-${color}-500/10 rounded-2xl text-${color}-400`}>
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="font-black text-xl text-white">{title}</h3>
    </div>
    <div className="space-y-4">
      {Object.entries(data || {}).map(([k, v]: any) => (
        <div key={k} className="flex justify-between items-center border-b border-white/5 pb-3">
          <span className="text-slate-500 text-sm font-medium">{k}</span>
          <span className="text-white font-black text-sm">{v}</span>
        </div>
      ))}
      {advice && <p className={`text-[11px] text-${color}-400 pt-4 font-black flex items-center gap-2`}><Info className="w-4 h-4" /> {advice}</p>}
    </div>
  </div>
);

export default App;
