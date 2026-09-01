const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { MercadoPagoConfig, Preference } = require("mercadopago");

admin.initializeApp();
const db = admin.firestore();

// 1. VINCULACIÓN CON MERCADO PAGO (Con tu Token de Producción)
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-6833794088335303-083119-b69866c41b40229744e60480576a5026-293180350' });

// 2. CREAR LINK DE PAGO
exports.createPaymentPreference = functions.https.onCall(async (data, context) => {
    // Si no está logueado, lo rebotamos por seguridad
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    
    const uid = context.auth.uid;
    const preference = new Preference(client);

    try {
        const response = await preference.create({
            body: {
                items: [{
                    id: "premium_audit",
                    title: "Auditoría Premium FiltroInstagram",
                    quantity: 1,
                    unit_price: 5000,
                    currency_id: "ARS"
                }],
                external_reference: uid, // Clave: Enviamos el UID para saber quién nos pagó
                // NOTA: Esta URL la actualizaremos luego con la que nos dé Firebase al subir esto
                notification_url: "https://us-central1-TU-PROYECTO.cloudfunctions.net/mpWebhook",
                back_urls: {
                    success: "http://localhost:5500", // Cambialo por tu dominio (ej: herradin.com.ar o similar) cuando lo subas
                    pending: "http://localhost:5500",
                    failure: "http://localhost:5500"
                },
                auto_return: "approved"
            }
        });
        return { init_point: response.init_point };
    } catch (error) {
        throw new functions.https.HttpsError('internal', 'Error al conectar con Mercado Pago');
    }
});

// 3. WEBHOOK (Escucha cuando la plata entra y suma el crédito en Firestore)
exports.mpWebhook = functions.https.onRequest(async (req, res) => {
    const topic = req.query.topic || req.body.type;
    
    if (topic === 'payment') {
        const paymentId = req.query.id || req.body.data.id;
        
        try {
            // Buscamos el pago en MP para confirmar que es real y está aprobado
            const fetch = require('node-fetch'); // Usamos fetch interno de Node
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${client.accessToken}` }
            });
            const paymentInfo = await response.json();

            if (paymentInfo.status === 'approved') {
                const uid = paymentInfo.external_reference; // Recuperamos el UID del usuario
                
                // Le sumamos 1 crédito en Firestore
                await db.collection("users").doc(uid).update({
                    creditos: admin.firestore.FieldValue.increment(1)
                });
            }
        } catch (error) {
            console.error("Error validando pago:", error);
        }
    }
    // Siempre hay que responderle 200 OK a MP para que deje de avisar
    res.status(200).send("OK");
});