import os
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

# Importe ton application FastAPI depuis le dossier backend
# Assure-toi que dans backend/__init__.py ou via l'import direct ça fonctionne
from backend.main import app 

# --- CONFIGURATION DU FRONTEND ---
# Chemin vers le dossier 'dist' que tu viens de générer
current_dir = os.path.dirname(os.path.abspath(__file__))
dist_path = os.path.join(current_dir, "dist")

if os.path.exists(dist_path):
    # Sert les fichiers statiques (JS, CSS)
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    # Route pour servir l'application React (PWA)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Si le fichier demandé existe (ex: favicon, logo), on le sert
        local_file = os.path.join(dist_path, full_path)
        if full_path != "" and os.path.exists(local_file):
            return FileResponse(local_file)
        # Sinon, on renvoie l'index.html (indispensable pour React Router)
        return FileResponse(os.path.join(dist_path, "index.html"))

if __name__ == "__main__":
    print("Démarrage de Kibali Store IA...")
    # Lancement sur le port 9000 comme prévu dans ta config Vite
    uvicorn.run(app, host="0.0.0.0", port=9000)