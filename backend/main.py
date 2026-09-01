from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import mercadopago
import firebase_admin
from firebase_admin import credentials, firestore

# 1. Inicializar Firebase (Usa el archivo JSON que descargaste)
try:
    cred = credentials.Certificate("firebase_credentials.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    print(f"Aviso: Firebase no inicializado (Falta JSON). Error: {e}")
    db = None

# 2. Inicializar Mercado Pago (PEGÁ TU ACCESS TOKEN REAL ACÁ ABAJO)
sdk = mercadopago.SDK("APP_USR-TU_ACCESS_TOKEN_SECRETO_AQUI")

app = FastAPI()

# 3. CORS para que el HTML pueda hablar con Python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/crear-preferencia")
async def crear_preferencia(request: Request):
    try:
        data = await request.json()
        uid = data.get("uid")
        
        if not uid:
            raise HTTPException(status_code=400, detail="Falta el UID del usuario")

        preference_data = {
            "items": [
                {
                    "title": "Pack Premium FiltroInstagram",
                    "quantity": 1,
                    "currency_id": "ARS",
                    "unit_price": 5000.0
                }
            ],
            "external_reference": uid,
            "notification_url": "https://tu-dominio.com/webhook",
        }

        preference_response = sdk.preference().create(preference_data)
        preference = preference_response["response"]
        
        return {"init_point": preference["init_point"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/webhook")
async def mercado_pago_webhook(request: Request):
    topic = request.query_params.get("topic") or request.query_params.get("type")
    
    if topic == "payment":
        payment_id = request.query_params.get("data.id")
        payment_info = sdk.payment().get(payment_id)["response"]
        
        if payment_info.get("status") == "approved":
            uid = payment_info.get("external_reference")
            
            if db and uid:
                user_ref = db.collection("users").document(uid)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    current_credits = user_doc.to_dict().get("creditos", 0)
                    user_ref.update({"creditos": current_credits + 1})
                else:
                    user_ref.set({"creditos": 1})
                    
    return {"status": "ok"}