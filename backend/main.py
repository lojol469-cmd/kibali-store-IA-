# --- START OF FILE main.py ---
import os
import shutil
import json
import time
import sys
import subprocess
import logging
import threading
from pathlib import Path
from typing import List, Optional, Dict, Any, Union

# Import FastAPI libraries
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Body, Path as PathParam
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Import python-dotenv to load .env file
from dotenv import load_dotenv

import torch
from huggingface_hub import snapshot_download, HfApi
import requests

# Tentative d'import des libs optionnelles
try:
    from safetensors.torch import load_file
    SAFE_TENSORS_AVAILABLE = True
except ImportError:
    SAFE_TENSORS_AVAILABLE = False

try:
    from transformers import AutoConfig
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

# ===============================
# CONFIGURATION
# ===============================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("KibaliBackend")

load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
if HF_TOKEN:
    os.environ["HUGGINGFACE_HUB_TOKEN"] = HF_TOKEN
else:
    logger.warning("⚠️ HF_TOKEN non trouvé. Les modèles privés/gated échoueront.")

# Chemins
CACHE_DIR = Path(os.path.expanduser("~")) / ".cache"
CACHE_HF = CACHE_DIR / "huggingface/hub"
CACHE_PHOTOGRAM = CACHE_DIR / "photogram_models"

# Outils système
ARIA2_AVAILABLE = shutil.which("aria2c") is not None

# ===============================
# MODÈLES DE DONNÉES (Pydantic)
# ===============================

class ModelInfo(BaseModel):
    nom: str
    repo_id: str
    chemin: str
    taille_fmt: str
    taille_bytes: int
    statut: str          # "Complet" | "Incomplet"
    type: str            # "HuggingFace" | "Photogram"
    pytorch: bool
    tf: bool
    cuda_compatible: bool
    standard_hf: bool    # True = AutoModel, False = Custom Code
    custom_files: List[str] # Liste des fichiers .py à la racine si custom

class SearchResult(BaseModel):
    id: str
    author: Optional[str]
    downloads: int
    is_standard: bool
    tags: List[str]
    likes: int
    pipeline_tag: Optional[str]

class SearchPayload(BaseModel):
    query: str
    limit: int = 10

class DownloadPayload(BaseModel):
    repo_id: str

class VerifyPayload(BaseModel):
    repo_id: str

class DeletePayload(BaseModel):
    repo_id: str

class SnippetResponse(BaseModel):
    code: str
    description: str
    is_standard: bool

# ===============================
# LOGIQUE MÉTIER
# ===============================

def sizeof_fmt(num, suffix='B'):
    for unit in ['','K','M','G','T','P','E','Z']:
        if abs(num) < 1024.0:
            return f"{num:3.1f}{unit}{suffix}"
        num /= 1024.0
    return f"{num:.1f}Y{suffix}"

def get_dir_size(path: Path):
    total = 0
    try:
        for f in path.rglob('*'):
            if f.is_file():
                total += f.stat().st_size
    except Exception:
        pass
    return total, sizeof_fmt(total)

def analyze_remote_repo(repo_id: str) -> Dict[str, Any]:
    """Analyse un repo distant pour déterminer s'il est standard HF ou Custom."""
    is_standard = False
    custom_files = []
    
    try:
        api = HfApi(token=HF_TOKEN)
        # 1. Vérifier config.json
        try:
            url = f"https://huggingface.co/{repo_id}/resolve/main/config.json"
            headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                config = resp.json()
                if 'architectures' in config or 'model_type' in config:
                    is_standard = True
        except:
            pass

        # 2. Lister les fichiers pour détecter du code custom
        files = api.list_repo_files(repo_id)
        root_py = [f for f in files if f.endswith('.py') and '/' not in f and f not in ['requirements.txt', 'setup.py']]
        
        if len(root_py) > 0:
            # S'il y a du code python à la racine, c'est souvent un modèle custom nécessitant `trust_remote_code=True`
            # ou des imports manuels. On le signale.
            custom_files = root_py
            # Certains modèles sont "Standard" MAIS avec du code custom (ex: Qwen, Falcon au début)
            # On garde is_standard=True si config.json est propre, mais on notera les fichiers custom.
            
    except Exception as e:
        logger.error(f"Erreur analyse remote {repo_id}: {e}")
    
    return {"is_standard": is_standard, "custom_files": custom_files}

def download_worker(repo_id: str):
    logger.info(f"🚀 Démarrage téléchargement: {repo_id}")
    try:
        model_name = repo_id.replace("/", "--")
        
        if ARIA2_AVAILABLE:
            api = HfApi(token=HF_TOKEN)
            info = api.repo_info(repo_id)
            commit_hash = info.sha
            
            storage_folder = CACHE_HF / f"models--{model_name}" / "snapshots" / commit_hash
            storage_folder.mkdir(parents=True, exist_ok=True)
            
            files = api.list_repo_files(repo_id)
            for file in files:
                url = f"https://huggingface.co/{repo_id}/resolve/main/{file}"
                local_dir = storage_folder / Path(file).parent
                local_dir.mkdir(parents=True, exist_ok=True)
                
                cmd = ["aria2c", "-x16", "-s16", "-k1M", "-c", "-d", str(local_dir), "-o", Path(file).name, url]
                if HF_TOKEN:
                    cmd.append(f"--header=Authorization: Bearer {HF_TOKEN}")
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
            
            # Création refs
            refs_path = CACHE_HF / f"models--{model_name}" / "refs"
            refs_path.mkdir(parents=True, exist_ok=True)
            (refs_path / "main").write_text(commit_hash)
            
        else:
            snapshot_download(repo_id, cache_dir=str(CACHE_HF), token=HF_TOKEN)
            
        logger.info(f"✅ Téléchargement terminé: {repo_id}")
    except Exception as e:
        logger.error(f"❌ Erreur téléchargement {repo_id}: {e}")

def analyze_local_model(model_path: Path):
    """Analyse un modèle déjà téléchargé."""
    is_std = False
    custom_files = []
    
    # Check config.json
    config_path = model_path / 'config.json'
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            if 'architectures' in config: is_std = True
        except: pass
        
    # Check python files
    custom_files = [f.name for f in model_path.glob("*.py") if f.name not in ['requirements.txt', 'setup.py']]
    
    # Si code custom présent, c'est "moins" standard
    if custom_files and is_std:
        # C'est un modèle HF qui utilise trust_remote_code=True
        pass
    
    return is_std, custom_files

# ===============================
# API APPLICATION
# ===============================

app = FastAPI(title="Kibali Backend Pro", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Kibali Backend Online", "aria2": ARIA2_AVAILABLE, "cuda": torch.cuda.is_available()}

@app.get("/diagnostics")
def get_diagnostics():
    diag = {}
    if PSUTIL_AVAILABLE:
        mem = psutil.virtual_memory()
        diag["RAM"] = {
            "Totale": sizeof_fmt(mem.total),
            "Utilisée": f"{mem.percent}%",
            "Libre": sizeof_fmt(mem.available)
        }
        cpu = psutil.cpu_freq()
        diag["CPU"] = {
            "Cœurs": psutil.cpu_count(logical=False),
            "Threads": psutil.cpu_count(logical=True),
            "Fréquence": f"{cpu.max/1000:.1f}GHz" if cpu else "N/A"
        }
    
    if torch.cuda.is_available():
        d = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(d)
        diag["GPU/CUDA"] = {
            "Disponible": "Oui",
            "Nom GPU": props.name,
            "VRAM": sizeof_fmt(props.total_memory)
        }
    else:
        diag["GPU/CUDA"] = {"Disponible": "Non"}
        
    return diag

@app.get("/models", response_model=List[ModelInfo])
def list_models():
    results = []
    if CACHE_HF.exists():
        for d in CACHE_HF.iterdir():
            if d.is_dir() and d.name.startswith("models--"):
                try:
                    repo_id = d.name.replace("models--", "").replace("--", "/")
                    snapshots = d / "snapshots"
                    if not snapshots.exists(): continue
                    # Prendre le snapshot le plus récent
                    latest_snap = max(snapshots.iterdir(), key=os.path.getmtime)
                    
                    size_b, size_str = get_dir_size(latest_snap)
                    is_std, custom_files = analyze_local_model(latest_snap)
                    
                    has_pt = len(list(latest_snap.rglob("*.bin"))) > 0 or len(list(latest_snap.rglob("*.safetensors"))) > 0
                    has_tf = len(list(latest_snap.rglob("*.h5"))) > 0
                    
                    results.append(ModelInfo(
                        nom=d.name,
                        repo_id=repo_id,
                        chemin=str(latest_snap),
                        taille_fmt=size_str,
                        taille_bytes=size_b,
                        statut="Complet" if size_b > 10*1024*1024 else "Incomplet",
                        type="HuggingFace",
                        pytorch=has_pt,
                        tf=has_tf,
                        cuda_compatible=torch.cuda.is_available(),
                        standard_hf=is_std,
                        custom_files=custom_files
                    ))
                except Exception as e:
                    logger.error(f"Erreur lecture {d.name}: {e}")
    return results

@app.post("/models/check-remote")
def check_remote(payload: DownloadPayload):
    """Analyse un repo distant AVANT téléchargement."""
    analysis = analyze_remote_repo(payload.repo_id)
    return {
        "repo_id": payload.repo_id,
        "is_standard": analysis["is_standard"],
        "custom_files": analysis["custom_files"],
        "message": "Standard HF (Facile)" if analysis["is_standard"] and not analysis["custom_files"] else "Custom/Complexe (Attention)"
    }

@app.post("/models/search", response_model=List[SearchResult])
def search_hf(payload: SearchPayload):
    try:
        api = HfApi(token=HF_TOKEN)
        models = api.list_models(search=payload.query, sort="downloads", direction=-1, limit=payload.limit)
        results = []
        for m in models:
            # Heuristique rapide pour 'standard'
            is_std = "transformers" in (m.tags or [])
            
            results.append(SearchResult(
                id=m.id,
                author=m.author,
                downloads=m.downloads,
                is_standard=is_std,
                tags=m.tags if m.tags else [],
                likes=m.likes if hasattr(m, 'likes') else 0,
                pipeline_tag=m.pipeline_tag
            ))
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/models/download")
def download_model_route(payload: DownloadPayload, bg_tasks: BackgroundTasks):
    bg_tasks.add_task(download_worker, payload.repo_id)
    return {"status": "queued", "message": f"Téléchargement de {payload.repo_id} démarré."}

@app.post("/models/snippet", response_model=SnippetResponse)
def get_usage_snippet(payload: DownloadPayload):
    """Génère le code Python exact pour charger le modèle."""
    repo_id = payload.repo_id
    model_name = repo_id.replace("/", "--")
    base_path = CACHE_HF / f"models--{model_name}" / "snapshots"
    
    local_path = repo_id # Par défaut on utilise l'ID
    is_std = True
    custom_files = []

    if base_path.exists():
        try:
            snap = max(base_path.iterdir(), key=os.path.getmtime)
            local_path = str(snap)
            is_std, custom_files = analyze_local_model(snap)
        except: pass
    else:
        # Si pas téléchargé, on check le remote
        analysis = analyze_remote_repo(repo_id)
        is_std = analysis["is_standard"]
        custom_files = analysis["custom_files"]

    if is_std:
        trust_remote = "trust_remote_code=True" if custom_files else "trust_remote_code=False"
        code = f"""from transformers import AutoModel, AutoTokenizer

model_id = "{local_path}"

# Chargement automatique
model = AutoModel.from_pretrained(model_id, {trust_remote})
tokenizer = AutoTokenizer.from_pretrained(model_id)

print("Modèle chargé !")"""
        desc = "Code Standard Hugging Face (Transformers)"
    
    else:
        # Mode Custom / Difficile
        code = f"""import sys
from pathlib import Path
import torch

# Chemin vers les fichiers téléchargés
model_path = Path(r"{local_path}")
sys.path.append(str(model_path))

# ATTENTION: Modèle Custom. 
# Vous devez identifier le fichier principal et la classe.
# Exemple hypothétique :
# from modeling_custom import CustomModel
# model = CustomModel.load(model_path)

print("Ce modèle nécessite une implémentation manuelle.")"""
        desc = "⚠️ Modèle Custom (Nécessite code spécifique)"

    return SnippetResponse(code=code, description=desc, is_standard=is_std)

@app.post("/models/verify")
def verify_model(payload: VerifyPayload):
    # Logique de vérification (charge config ou poids)
    model_name = payload.repo_id.replace("/", "--")
    base_path = CACHE_HF / f"models--{model_name}" / "snapshots"
    
    if not base_path.exists():
        return {"repo_id": payload.repo_id, "fonctionnel": False, "details": "Non installé"}
    
    try:
        snap = max(base_path.iterdir(), key=os.path.getmtime)
        is_std, _ = analyze_local_model(snap)
        
        if is_std and TRANSFORMERS_AVAILABLE:
            AutoConfig.from_pretrained(str(snap), trust_remote_code=True)
            return {"repo_id": payload.repo_id, "fonctionnel": True, "details": "Configuration valide", "path": str(snap)}
        
        # Check poids
        weights = list(snap.rglob("*.safetensors")) + list(snap.rglob("*.bin"))
        if weights:
             return {"repo_id": payload.repo_id, "fonctionnel": True, "details": f"{len(weights)} fichiers de poids trouvés", "path": str(snap)}
        
        return {"repo_id": payload.repo_id, "fonctionnel": False, "details": "Aucun poids détecté"}
    except Exception as e:
        return {"repo_id": payload.repo_id, "fonctionnel": False, "details": str(e)}

@app.delete("/models")
def delete_model(payload: DeletePayload):
    model_name = payload.repo_id.replace("/", "--")
    path = CACHE_HF / f"models--{model_name}"
    if path.exists():
        shutil.rmtree(path)
        return {"success": True, "message": "Supprimé"}
    raise HTTPException(404, "Non trouvé")

@app.post("/system/cleanup")
def cleanup_system(type: str = Query("incomplete")):
    deleted = []
    # Logique simplifiée pour l'exemple
    if CACHE_HF.exists():
        for d in CACHE_HF.iterdir():
            if d.is_dir():
                s, _ = get_dir_size(d)
                if s < 1024*1024: # < 1Mo = probablement fail
                    shutil.rmtree(d)
                    deleted.append(d.name)
    return {"count": len(deleted), "deleted": deleted}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)