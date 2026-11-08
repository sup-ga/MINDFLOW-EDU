import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const SB=Deno.env.get("SUPABASE_URL")??"",SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const out=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
const clean=(v:unknown,n:number)=>typeof v==="string"?v.trim().slice(0,n):"";
function phone(v:string){let p=v.replace(/[^0-9+]/g,"");if(p.startsWith("+241"))p=p.slice(4);else if(p.startsWith("241"))p=p.slice(3);return p;}
async function rest(path:string,init:RequestInit={}){return fetch(new URL(path,SB),{...init,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,...(init.headers||{})}});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:H});
 if(req.method!=="POST")return out({success:false,error:"Méthode non autorisée."},405);
 if(!SB||!SERVICE)return out({success:false,error:"Service de commande non configuré."},503);
 try{
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  if(!token)return out({success:false,error:"Connecte-toi à ton compte apprenant avant d’acheter. Ton achat sera ainsi conservé dans ta bibliothèque."},401);
  const ur=await fetch(SB+"/auth/v1/user",{headers:{apikey:req.headers.get("apikey")||SERVICE,Authorization:"Bearer "+token}});
  if(!ur.ok)return out({success:false,error:"Session invalide. Reconnecte-toi avant de payer."},401);
  const user=await ur.json();if(!user?.id||!user?.email)return out({success:false,error:"Compte apprenant invalide."},401);
  const b=await req.json().catch(()=>null);if(!b||typeof b!=="object"||Array.isArray(b))return out({success:false,error:"Corps de requête invalide."},400);
  const productId=clean(b.product_id,80),offerId=clean(b.offer_id,80),classId=clean(b.class_id,80),tutorRequestId=clean(b.tutor_request_id,80),classRequestId=clean(b.class_request_id,80);
  const name=clean(b.customer_name,120),email=clean(b.customer_email,254).toLowerCase(),tel=phone(clean(b.customer_phone,40));
  if(!name||!email||!tel)return out({success:false,error:"Nom, e-mail et téléphone obligatoires."},400);
  if(email!==String(user.email).toLowerCase())return out({success:false,error:"Utilise l’adresse e-mail de ton compte connecté pour que l’achat soit rattaché à ta bibliothèque."},400);
  if(!/^0\d{8}$/.test(tel))return out({success:false,error:"Numéro invalide. Indique un numéro gabonais commençant par 0."},400);
  const targetCount=[productId,offerId,classId,tutorRequestId].filter(Boolean).length;
  if(targetCount!==1)return out({success:false,error:"Choisis un seul produit, pack, classe ou offre de prestation."},400);
  let orderType="product",amount=0,title="",product_id:string|null=null,offer_id:string|null=null,class_id:string|null=null,tutor_request_id:string|null=null,class_request_id:string|null=null;
  if(tutorRequestId){
   if(!/^[0-9a-f-]{36}$/i.test(tutorRequestId))return out({success:false,error:"Identifiant de demande invalide."},400);
   const r=await rest("/rest/v1/tutor_requests?id=eq."+encodeURIComponent(tutorRequestId)+"&learner_id=eq."+encodeURIComponent(user.id)+"&status=eq.awaiting_payment&select=id,learner_id,learner_name,learner_email,contact_phone,official_offer_amount,official_offer_sent_at,tutor_name");
   if(!r.ok)return out({success:false,error:"Impossible de vérifier l’offre de prestation."},502);
   const rows=await r.json(),request=rows?.[0];
   if(!request)return out({success:false,error:"Cette offre n’est plus disponible pour le paiement."},404);
   if(!request.official_offer_sent_at||!request.tutor_name)return out({success:false,error:"L’offre officielle n’est pas complète."},409);
   if(String(request.learner_email).toLowerCase()!==String(user.email).toLowerCase())return out({success:false,error:"L’adresse e-mail de la demande ne correspond pas au compte connecté."},403);
   amount=Number(request.official_offer_amount);title="Prestation MindFlow — "+tutorRequestId;tutor_request_id=request.id;orderType="tutor_request";
  }else if(productId){
   if(!/^[0-9a-f-]{36}$/i.test(productId))return out({success:false,error:"Identifiant de produit invalide."},400);
   const r=await rest("/rest/v1/products?id=eq."+encodeURIComponent(productId)+"&is_active=eq.true&status=eq.published&select=id,title,price,currency,is_free");
   if(!r.ok)return out({success:false,error:"Impossible de vérifier le produit."},502);const rows=await r.json();const p=rows?.[0];
   if(!p)return out({success:false,error:"Produit indisponible."},404);if(p.is_free)return out({success:false,error:"Cette ressource est gratuite, aucun paiement n’est nécessaire."},409);
   amount=Number(p.price);title=p.title;product_id=p.id;
  }else if(offerId){
   if(!/^[0-9a-f-]{36}$/i.test(offerId))return out({success:false,error:"Identifiant de pack invalide."},400);
   const r=await rest("/rest/v1/professional_offers?id=eq."+encodeURIComponent(offerId)+"&status=eq.published&select=id,title,price,currency,is_free,professional_id,offer_type");
   if(!r.ok)return out({success:false,error:"Impossible de vérifier l’offre."},502);const rows=await r.json();const p=rows?.[0];
   if(!p)return out({success:false,error:"Offre indisponible."},404);if(p.is_free||Number(p.price)<=0)return out({success:false,error:"Cette offre n’est pas configurée comme payante."},409);
   amount=Number(p.price);title=p.title;offer_id=p.id;orderType="offer";
   if(p.offer_type==="individual"){
    if(!classRequestId||!/^[0-9a-f-]{36}$/i.test(classRequestId))return out({success:false,error:"La demande de cours individuel est manquante."},400);
    const cr=await rest("/rest/v1/class_requests?id=eq."+encodeURIComponent(classRequestId)+"&learner_id=eq."+encodeURIComponent(user.id)+"&offer_id=eq."+encodeURIComponent(p.id)+"&status=eq.accepted&select=id,requested_hours,requested_start_at,requested_end_at,payment_expires_at,payment_status");
    if(!cr.ok)return out({success:false,error:"Impossible de vérifier la demande acceptée."},502);
    const requests=await cr.json(),request=requests?.[0];
    if(!request||!Number.isInteger(Number(request.requested_hours))||Number(request.requested_hours)<1)return out({success:false,error:"Cette demande n’est pas acceptée ou son nombre d’heures est invalide."},409);
    if(request.payment_status==="paid")return out({success:false,error:"Cette demande a déjà été payée."},409);
    if(!request.requested_start_at||!request.requested_end_at||!request.payment_expires_at||Date.parse(request.payment_expires_at)<=Date.now())return out({success:false,error:"Le délai de 30 minutes est expiré ou le créneau n’est plus valide. Envoie une nouvelle demande au professeur."},409);
    if(Date.parse(request.requested_end_at)-Date.parse(request.requested_start_at)!==Number(request.requested_hours)*60*60*1000)return out({success:false,error:"La durée du créneau ne correspond pas au nombre d’heures demandé."},409);
    amount=Number(p.price)*Number(request.requested_hours);class_request_id=request.id;
   }else if(classRequestId)return out({success:false,error:"Cette demande ne correspond pas à un cours individuel."},409);
  }else{
   if(!/^[0-9a-f-]{36}$/i.test(classId))return out({success:false,error:"Identifiant de classe invalide."},400);
   const r=await rest("/rest/v1/professional_classes?id=eq."+encodeURIComponent(classId)+"&status=in.(planned,open)&select=id,title,offer_id,professional_id,capacity");
   if(!r.ok)return out({success:false,error:"Impossible de vérifier la classe."},502);const rows=await r.json();const cls=rows?.[0];
   if(!cls)return out({success:false,error:"Classe indisponible."},404);
   const offerRes=await rest("/rest/v1/professional_offers?id=eq."+encodeURIComponent(cls.offer_id)+"&status=eq.published&select=id,title,price,is_free");
   if(!offerRes.ok)return out({success:false,error:"Impossible de vérifier le tarif de la classe."},502);const os=await offerRes.json();const offer=os?.[0];
   if(!offer||offer.is_free||Number(offer.price)<=0)return out({success:false,error:"La classe n’a pas de tarif payant valide."},409);
   amount=Number(offer.price);title=cls.title||offer.title;class_id=cls.id;orderType="class";
  }
  if(!Number.isSafeInteger(amount)||amount<=0)return out({success:false,error:"Le prix doit être un montant entier positif en FCFA."},409);
  if(tutor_request_id){const existing=await rest("/rest/v1/orders?tutor_request_id=eq."+encodeURIComponent(tutor_request_id)+"&status=eq.pending&select=id,product_id,offer_id,class_id,order_type,customer_user_id,customer_email,amount,currency,status,payment_state,delivery_status,created_at&order=created_at.desc&limit=1");if(!existing.ok)return out({success:false,error:"Impossible de vérifier une commande de paiement déjà créée."},502);const prior=await existing.json();if(Array.isArray(prior)&&prior.length)return out({success:true,existing:true,order:prior[0],product_title:title});}if(class_request_id){const existing=await rest("/rest/v1/orders?class_request_id=eq."+encodeURIComponent(class_request_id)+"&status=eq.pending&select=id,product_id,offer_id,class_id,class_request_id,order_type,customer_user_id,customer_email,amount,currency,status,payment_state,delivery_status,created_at&limit=1");if(!existing.ok)return out({success:false,error:"Impossible de vérifier le paiement déjà préparé pour cette demande."},502);const prior=await existing.json();if(Array.isArray(prior)&&prior.length)return out({success:true,existing:true,order:prior[0],product_title:title});}
  const order={id:crypto.randomUUID(),product_id,offer_id,class_id,tutor_request_id,class_request_id,order_type:orderType,customer_user_id:user.id,customer_name:name,customer_email:email,customer_phone:tel,amount,currency:"XAF",status:"pending",payment_state:"pending",delivery_status:"not_required"};
  const ir=await rest("/rest/v1/orders?select=id,product_id,offer_id,class_id,class_request_id,order_type,customer_user_id,customer_email,amount,currency,status,payment_state,delivery_status,created_at",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(order)});
  const body=await ir.text();if(!ir.ok){console.error("Order insert failed",ir.status,body);return out({success:false,error:"Impossible d’enregistrer la commande."},502);}
  const rows=JSON.parse(body);if(!Array.isArray(rows)||rows.length!==1)return out({success:false,error:"La commande n’a pas pu être confirmée."},502);
  if(tutor_request_id){const link=await rest("/rest/v1/tutor_requests?id=eq."+encodeURIComponent(tutor_request_id),{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({payment_order_id:rows[0].id})});if(!link.ok){console.error("Tutor request order link failed",link.status);return out({success:false,error:"Commande créée mais lien de paiement à régulariser par MindFlow."},502);}}
  return out({success:true,order:rows[0],product_title:title},201);
 }catch(e){console.error("create-mindflow-order",e instanceof Error?e.message:String(e));return out({success:false,error:"Erreur interne lors de la création de commande."},500);}
});