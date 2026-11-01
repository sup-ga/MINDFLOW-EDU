import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const BUCKET = "mindflow-products";
const headers = {"Access-Control-Allow-Origin":"https://sup-ga.github.io","Vary":"Origin","Access-Control-Allow-Headers":"content-type, apikey, authorization, x-client-info","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const rest=(path:string)=>SUPABASE_URL+"/rest/v1/"+path;
async function db(path:string,method="GET",body?:unknown,prefer?:string){
  return fetch(rest(path),{method,headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json",...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
function safePath(path:string){const p=String(path||"").replace(/^\/+/, "");return Boolean(p)&&!p.split("/").some(x=>!x||x==="."||x==="..");}
async function signed(path:string,download=false){
  if(!safePath(path))throw new Error("Fichier non configuré.");
  const r=await fetch(SUPABASE_URL+"/storage/v1/object/sign/"+BUCKET+"/"+path.split("/").map(encodeURIComponent).join("/"),{method:"POST",headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:180,download:download||false})});
  if(!r.ok)throw new Error("Fichier momentanément indisponible.");
  const d=await r.json(),s=String(d.signedURL??d.signedUrl??"");
  if(!s)throw new Error("Lien sécurisé indisponible.");
  return /^https?:\/\//i.test(s)?s:new URL(s.startsWith("/storage/v1/")?s:"/storage/v1"+(s.startsWith("/")?s:"/"+s),SUPABASE_URL).toString();
}
function tokenClaims(req:Request){
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  try{const part=token.split(".")[1];if(!part)return null;const normalized=part.replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,"=")));}catch{return null;}
}
async function adminAllowed(req:Request,userId:string){
  const claims=tokenClaims(req);if(claims?.aal!=="aal2")return false;
  const r=await db("library_admins?select=user_id&user_id=eq."+encodeURIComponent(userId)+"&is_active=eq.true&limit=1");
  return r.ok&&(await r.json()).length===1;
}
function validMime(kind:string,mime:string,name:string){
  const ext=name.toLowerCase().split(".").pop()||"";
  const map:Record<string,string[]>={pdf:["application/pdf"],epub:["application/epub+zip"],cover:["image/jpeg","image/png","image/webp"],preview:["image/jpeg","image/png","image/webp"],supplement:["application/pdf","image/jpeg","image/png"]};
  const extensions:Record<string,string[]>={pdf:["pdf"],epub:["epub"],cover:["jpg","jpeg","png","webp"],preview:["jpg","jpeg","png","webp"],supplement:["pdf","jpg","jpeg","png"]};
  return (map[kind]??[]).includes(mime)&&(extensions[kind]??[]).includes(ext);
}
async function identify(req:Request){
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{apikey:PUBLIC||SERVICE,Authorization:"Bearer "+token}});
  if(!r.ok)return null;const u=await r.json();return u?.id?String(u.id):null;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(!SUPABASE_URL||!SERVICE)return reply({success:false,error:"Bibliothèque indisponible."},503);
  try{
    if(req.method==="GET"){
      const u=new URL(req.url),q=(u.searchParams.get("q")??"").trim().slice(0,100),category=u.searchParams.get("category"),mine=u.searchParams.get("mine")==="1";
      let endpoint="library_books?select=id,slug,title,subtitle,author_name,description,publisher_name,publication_year,language,country_of_origin,book_type,access_mode,product_id,cover_path,featured,library_book_categories(category:library_categories(id,slug,name)),product:products(id,price,is_free)&status=eq.published&order=featured.desc,published_at.desc&limit=80";
      if(mine){
        const userId=await identify(req);if(!userId)return reply({success:false,error:"Connecte-toi pour consulter ta bibliothèque."},401);
        endpoint="library_books?select=id,slug,title,subtitle,author_name,description,book_type,access_mode,product_id,cover_path,learner_library_books!inner(learner_id,added_at,access_origin)&learner_library_books.learner_id=eq."+userId+"&status=eq.published&order=title.asc";
      }
      const b=await db(endpoint);
      if(!b.ok)return reply({success:false,error:"Impossible de charger les livres."},502);
      let books=await b.json();
      if(books.length){
        const rightsRes=await db("library_licenses?select=book_id,valid_from,valid_until,allow_online_reading,allow_download&status=eq.active");
        const filesRes=await db("library_files?select=book_id,file_kind,allow_online_reading,allow_download");
        const rights=rightsRes.ok?await rightsRes.json():[],files=filesRes.ok?await filesRes.json():[],today=new Date().toISOString().slice(0,10);
        const activeRights=new Set(rights.filter((l:Record<string,any>)=>(!l.valid_from||l.valid_from<=today)&&(!l.valid_until||l.valid_until>=today)&&(l.allow_online_reading||l.allow_download)).map((l:Record<string,any>)=>l.book_id));
        const readableFiles=new Set(files.filter((f:Record<string,any>)=>["pdf","epub"].includes(f.file_kind)&&(f.allow_online_reading||f.allow_download)).map((f:Record<string,any>)=>f.book_id));
        let activeEntitlements=new Set<string>();
        if(mine){const er=await db("learner_entitlements?select=product_id&learner_id=eq."+encodeURIComponent(await identify(req)??"")+"&status=eq.active");if(er.ok)activeEntitlements=new Set((await er.json()).map((x:Record<string,any>)=>x.product_id));}
        books=books.filter((book:Record<string,any>)=>{
          if(!activeRights.has(book.id)||!readableFiles.has(book.id))return false;
          if(!mine)return true;
          if(book.access_mode==="free")return true;
          if(book.access_mode==="paid")return !!book.product_id&&activeEntitlements.has(book.product_id);
          return (book.learner_library_books||[]).some((x:Record<string,any>)=>x.access_origin==="partner_grant");
        });
      }
      if(q){const n=q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();books=books.filter((x:Record<string,unknown>)=>[x.title,x.author_name,x.description,x.publisher_name].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(n));}
      if(category)books=books.filter((x:Record<string,any>)=>(x.library_book_categories??[]).some((c:any)=>c.category?.slug===category));
      books=await Promise.all(books.map(async(x:Record<string,any>)=>({...x,cover_url:x.cover_path?await signed(x.cover_path).catch(()=>null):null})));
      const c=mine?[]:await db("library_categories?select=id,slug,name,description&is_active=eq.true&order=display_order.asc").then(async r=>r.ok?await r.json():[]);
      return reply({success:true,books,categories:c});
    }
    if(req.method!=="POST")return reply({success:false,error:"Méthode non autorisée."},405);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action??"");
    if(action.startsWith("admin_")){
      const userId=await identify(req);
      if(!userId)return reply({success:false,error:"Connexion requise."},401);
      if(!await adminAllowed(req,userId))return reply({success:false,error:"Accès refusé : compte bibliothèque autorisé et authentification renforcée (MFA) requis."},403);
      if(action==="admin_list"){
        const tables=["library_books?select=*,library_book_categories(category_id)&order=updated_at.desc","library_partners?select=*&order=display_name.asc","library_licenses?select=*&order=created_at.desc","library_files?select=*&order=created_at.desc","library_categories?select=*&order=display_order.asc","library_quizzes?select=*&order=created_at.desc","products?select=id,title,price,is_free&is_active=eq.true&order=title.asc"];
        const results=await Promise.all(tables.map(db));
        if(results.some(r=>!r.ok))return reply({success:false,error:"Impossible de charger les données administratives."},502);
        const [books,partners,licenses,files,categories,quizzes,products]=await Promise.all(results.map(r=>r.json()));
        return reply({success:true,books,partners,licenses,files,categories,quizzes,products});
      }
      if(action==="admin_save_book"){
        const x=body.book??{};
        const payload={...(x.id?{id:x.id}:{}),slug:String(x.slug??"").trim(),title:String(x.title??"").trim(),author_name:String(x.author_name??"").trim(),description:String(x.description??""),publisher_name:x.publisher_name||null,publication_year:x.publication_year?Number(x.publication_year):null,isbn:x.isbn||null,language:x.language||"fr",country_of_origin:x.country_of_origin||"GA",book_type:x.book_type||"literary_work",access_mode:x.access_mode||"paid",status:x.status||"draft",featured:!!x.featured,cover_path:x.cover_path||null,product_id:x.product_id||null,updated_at:new Date().toISOString()};
        if(!payload.slug||!payload.title||!payload.author_name)return reply({success:false,error:"Titre, auteur et identifiant URL obligatoires."},400);
        if(payload.status==="published"){
          const today=new Date().toISOString().slice(0,10);
          const lr=await db("library_licenses?select=id,valid_from,valid_until,allow_online_reading,allow_download,allow_sale&book_id=eq."+encodeURIComponent(x.id||"00000000-0000-0000-0000-000000000000")+"&status=eq.active");
          const fr=await db("library_files?select=id,file_kind,allow_online_reading,allow_download&book_id=eq."+encodeURIComponent(x.id||"00000000-0000-0000-0000-000000000000"));
          const licenses=lr.ok?await lr.json():[],files=fr.ok?await fr.json():[];
          const valid=licenses.find((l:Record<string,any>)=>(!l.valid_from||l.valid_from<=today)&&(!l.valid_until||l.valid_until>=today)&&(l.allow_online_reading||l.allow_download)&&((payload.access_mode!=="paid")||l.allow_sale));
          if(!valid)return reply({success:false,error:"Avant publication, valide les droits de lecture/téléchargement et, pour un livre payant, la vente."},400);
          if(!files.some((f:Record<string,any>)=>["pdf","epub"].includes(f.file_kind)&&(f.allow_online_reading||f.allow_download)))return reply({success:false,error:"Ajoute au moins un fichier PDF ou EPUB autorisé avant publication."},400);
        }
        const r=await db("library_books?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement du livre impossible."},400);
        const saved=(await r.json())[0];
        if(saved.status==="published"&&saved.product_id){
          const er=await db("learner_entitlements?select=id,learner_id&product_id=eq."+encodeURIComponent(saved.product_id)+"&status=eq.active");
          if(er.ok){const entitlements=await er.json();for(const ent of entitlements){await db("learner_library_books?on_conflict=learner_id,book_id","POST",{learner_id:ent.learner_id,book_id:saved.id,access_origin:"purchase",entitlement_id:ent.id},"resolution=merge-duplicates");}}
        }
        if(Array.isArray(x.category_ids)){
          await db("library_book_categories?book_id=eq."+saved.id,"DELETE");
          if(x.category_ids.length){const links=x.category_ids.filter((id:string)=>/^[0-9a-f-]{36}$/i.test(id)).map((category_id:string)=>({book_id:saved.id,category_id}));if(links.length){const cr=await db("library_book_categories","POST",links);if(!cr.ok)return reply({success:false,error:"Ouvrage enregistré, mais ses collections n’ont pas pu être associées."},502);}}
        }
        return reply({success:true,book:saved});
      }
      if(action==="admin_save_partner"){
        const x=body.partner??{},payload={...(x.id?{id:x.id}:{}),partner_type:x.partner_type||"author",display_name:String(x.display_name??"").trim(),country:x.country||null,website_url:x.website_url||null,contact_email:x.contact_email||null,notes:x.notes||null,status:x.status||"pending",updated_at:new Date().toISOString()};
        if(!payload.display_name)return reply({success:false,error:"Nom de l’auteur ou partenaire obligatoire."},400);
        const r=await db("library_partners?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement du partenaire impossible."},400);
        return reply({success:true,partner:(await r.json())[0]});
      }
      if(action==="admin_save_license"){
        const x=body.license??{},payload={...(x.id?{id:x.id}:{}),book_id:x.book_id,partner_id:x.partner_id||null,rights_type:x.rights_type||"public_domain",territory:x.territory||["GA"],valid_from:x.valid_from||null,valid_until:x.valid_until||null,allow_online_reading:!!x.allow_online_reading,allow_download:!!x.allow_download,allow_sale:!!x.allow_sale,revenue_share_percent:x.revenue_share_percent===""||x.revenue_share_percent==null?null:Number(x.revenue_share_percent),contract_reference:x.contract_reference||null,status:x.status||"pending"};
        if(!payload.book_id)return reply({success:false,error:"Choisis un ouvrage pour associer les droits."},400);
        const bookCheck=await db("library_books?select=id,product_id&id=eq."+encodeURIComponent(payload.book_id)+"&limit=1");const linkedBook=(await bookCheck.json().catch(()=>[]))?.[0];
        if(!linkedBook)return reply({success:false,error:"Ouvrage introuvable."},404);
        if(payload.status==="active"&&payload.rights_type==="public_domain"&&!String(x.evidence_reference??"").trim())return reply({success:false,error:"Ajoute une référence vérifiable justifiant le domaine public avant activation."},400);
        if(payload.status==="active"&&payload.rights_type!=="public_domain"&&(!String(payload.contract_reference??"").trim()||!payload.partner_id))return reply({success:false,error:"Un ayant droit et une référence de contrat sont obligatoires pour activer ces droits."},400);
        if(payload.allow_sale&&!linkedBook.product_id)return reply({success:false,error:"Associe d’abord un produit MindFlow à cet ouvrage avant d’autoriser sa vente."},400);
        payload.evidence_reference=String(x.evidence_reference??"").trim()||null;
        const r=await db("library_licenses?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement des droits impossible."},400);
        return reply({success:true,license:(await r.json())[0]});
      }
      if(action==="admin_create_upload"){
        const x=body.file??{},bookId=String(x.book_id??""),kind=String(x.file_kind??""),name=String(x.file_name??"").trim().replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,140),mime=String(x.mime_type??"");
        if(!/^[0-9a-f-]{36}$/i.test(bookId)||!name||!validMime(kind,mime,name))return reply({success:false,error:"Livre, nom ou type de fichier invalide."},400);
        const bookCheck=await db("library_books?select=id&id=eq."+encodeURIComponent(bookId)+"&limit=1");if(!bookCheck.ok||(await bookCheck.json()).length!==1)return reply({success:false,error:"Ouvrage introuvable."},404);
        const path="library/"+bookId+"/"+kind+"/"+crypto.randomUUID()+"-"+name;
        const upload=await fetch(SUPABASE_URL+"/storage/v1/object/upload/sign/"+BUCKET+"/"+path.split("/").map(encodeURIComponent).join("/"),{method:"POST",headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE,"Content-Type":"application/json"},body:JSON.stringify({upsert:false})});
        const ud=await upload.json().catch(()=>({}));if(!upload.ok)return reply({success:false,error:"Impossible de préparer le téléversement sécurisé."},502);
        const uploadToken=String(ud.token??"");if(!uploadToken)return reply({success:false,error:"Jeton de téléversement indisponible."},502);
        return reply({success:true,storage_path:path,token:uploadToken,expires_in:7200});
      }
      if(action==="admin_save_quiz"){
        const x=body.quiz??{},bookId=String(x.book_id??""),title=String(x.title??"").trim(),questions=Array.isArray(x.questions)?x.questions:[];
        if(!/^[0-9a-f-]{36}$/i.test(bookId)||!title||!questions.length)return reply({success:false,error:"Livre, titre et au moins une question sont obligatoires."},400);
        if(questions.length>50||questions.some((q:any)=>!String(q.question_text??"").trim()||!Array.isArray(q.answers)||q.answers.length<2||q.answers.length>8||!q.answers.some((a:any)=>a.is_correct)))return reply({success:false,error:"Chaque question doit contenir 2 à 8 réponses et au moins une bonne réponse (maximum 50 questions)."},400);
        const quizPayload={...(x.id?{id:x.id}:{}),book_id:bookId,title,description:String(x.description??""),passing_score:Math.min(100,Math.max(0,Number(x.passing_score??50))),is_published:!!x.is_published};
        const qr=await db("library_quizzes?on_conflict=id","POST",quizPayload,"resolution=merge-duplicates,return=representation");if(!qr.ok)return reply({success:false,error:"Enregistrement du quiz impossible."},400);
        const quiz=(await qr.json())[0];
        await db("library_quiz_questions?quiz_id=eq."+quiz.id,"DELETE");
        for(let i=0;i<questions.length;i++){const q=questions[i],ins=await db("library_quiz_questions","POST",{quiz_id:quiz.id,question_text:String(q.question_text).trim(),question_type:q.question_type||"single_choice",explanation:String(q.explanation??""),display_order:i+1},"return=representation");if(!ins.ok)throw new Error("Impossible d’enregistrer les questions du quiz.");const question=(await ins.json())[0];const answers=q.answers.map((a:any,j:number)=>({question_id:question.id,answer_text:String(a.answer_text??"").trim(),is_correct:!!a.is_correct,display_order:j+1}));const ar=await db("library_quiz_answers","POST",answers);if(!ar.ok)throw new Error("Impossible d’enregistrer les réponses du quiz.");}
        return reply({success:true,quiz});
      }
      if(action==="admin_delete_file"||action==="admin_revoke_license"){
        const id=String(body.id??"");if(!/^[0-9a-f-]{36}$/i.test(id))return reply({success:false,error:"Identifiant invalide."},400);
        const table=action==="admin_delete_file"?"library_files":"library_licenses";const method=action==="admin_delete_file"?"DELETE":"PATCH";const path=table+"?id=eq."+encodeURIComponent(id);
        const result=await db(path,method,method==="PATCH"?{status:"revoked"}:undefined,"return=minimal");if(!result.ok)return reply({success:false,error:"Modification impossible."},400);return reply({success:true});
      }
      if(action==="admin_save_file"){
        const x=body.file??{},payload={...(x.id?{id:x.id}:{}),book_id:x.book_id,file_kind:x.file_kind||"pdf",storage_path:String(x.storage_path??"").trim(),file_name:x.file_name||null,mime_type:x.mime_type||null,allow_online_reading:!!x.allow_online_reading,allow_download:!!x.allow_download,is_primary:!!x.is_primary,display_order:Number(x.display_order||100)};
        if(!payload.book_id||!payload.storage_path||!safePath(payload.storage_path)||!payload.storage_path.startsWith("library/"+payload.book_id+"/"))return reply({success:false,error:"Livre et chemin de stockage valide dans le dossier de cet ouvrage obligatoires."},400);
        const r=await db("library_files?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement du fichier impossible."},400);
        return reply({success:true,file:(await r.json())[0]});
      }
      return reply({success:false,error:"Action administrative inconnue."},400);
    }
    const userId=await identify(req);if(!userId)return reply({success:false,error:"Connecte-toi pour accéder à ce livre."},401);
    const learnerId=await identify(req);if(!learnerId)return reply({success:false,error:"Connecte-toi pour accéder à cette fonctionnalité."},401);
    const learnerAction=String(body?.action??"");
    if(learnerAction==="quiz_list"){
      const bookId=String(body.book_id??"");if(!/^[0-9a-f-]{36}$/i.test(bookId))return reply({success:false,error:"Ouvrage invalide."},400);
      const br=await db("library_books?select=id,access_mode,status&id=eq."+encodeURIComponent(bookId)+"&status=eq.published&limit=1"),book=(await br.json().catch(()=>[]))?.[0];
      if(!br.ok||!book)return reply({success:false,error:"Ouvrage indisponible."},404);
      let entitled=book.access_mode==="free";
      if(book.access_mode==="paid"){const er=await db("learner_entitlements?select=id&learner_id=eq."+encodeURIComponent(learnerId)+"&product_id=eq."+encodeURIComponent(book.product_id??"")+"&status=eq.active");entitled=!!book.product_id&&er.ok&&(await er.json()).length>0;}
      if(book.access_mode==="partner"){const er=await db("learner_library_books?select=id&learner_id=eq."+encodeURIComponent(learnerId)+"&book_id=eq."+encodeURIComponent(bookId)+"&access_origin=eq.partner_grant&limit=1");entitled=er.ok&&(await er.json()).length>0;}
      if(!entitled)return reply({success:false,error:"Cet ouvrage n’est pas dans ta bibliothèque."},403);
      const lr=await db("library_licenses?select=id,valid_from,valid_until,allow_online_reading&book_id=eq."+encodeURIComponent(bookId)+"&status=eq.active"),today=new Date().toISOString().slice(0,10),licenses=lr.ok?await lr.json():[];
      if(!licenses.some((l:Record<string,any>)=>(!l.valid_from||l.valid_from<=today)&&(!l.valid_until||l.valid_until>=today)&&l.allow_online_reading))return reply({success:false,error:"Les droits de quiz ne sont pas disponibles."},403);
      const list=await db("library_quizzes?select=id,title,description,passing_score&book_id=eq."+encodeURIComponent(bookId)+"&is_published=eq.true&order=created_at.asc");
      return list.ok?reply({success:true,quizzes:await list.json()}):reply({success:false,error:"Quiz indisponibles."},502);
    }
    if(learnerAction==="quiz_get"||learnerAction==="quiz_submit"){
      const quizId=String(body.quiz_id??"");
      if(!/^[0-9a-f-]{36}$/i.test(quizId))return reply({success:false,error:"Quiz invalide."},400);
      const qr=await db("library_quizzes?select=id,book_id,title,description,passing_score,is_published& id=eq.".replace("& ","&")+encodeURIComponent(quizId)+"&is_published=eq.true&limit=1");
      const quiz=(await qr.json().catch(()=>[]))?.[0];if(!qr.ok||!quiz)return reply({success:false,error:"Quiz indisponible."},404);
      const br=await db("library_books?select=id,access_mode,product_id,status&id=eq."+encodeURIComponent(quiz.book_id)+"&status=eq.published&limit=1");
      const book=(await br.json().catch(()=>[]))?.[0];if(!br.ok||!book)return reply({success:false,error:"Ouvrage indisponible."},404);
      const lr=await db("library_licenses?select=id,valid_from,valid_until,allow_online_reading&book_id=eq."+encodeURIComponent(book.id)+"&status=eq.active");
      const today=new Date().toISOString().slice(0,10),licenses=lr.ok?await lr.json():[];
      if(!licenses.some((l:Record<string,any>)=>(!l.valid_from||l.valid_from<=today)&&(!l.valid_until||l.valid_until>=today)&&l.allow_online_reading))return reply({success:false,error:"Les droits de cet ouvrage ne permettent plus le quiz."},403);
      let entitled=book.access_mode==="free";
      if(book.access_mode==="paid"){const er=await db("learner_entitlements?select=id&learner_id=eq."+encodeURIComponent(learnerId)+"&product_id=eq."+encodeURIComponent(book.product_id??"")+"&status=eq.active");entitled=!!book.product_id&&er.ok&&(await er.json()).length>0;}
      if(book.access_mode==="partner"){const er=await db("learner_library_books?select=id&learner_id=eq."+encodeURIComponent(learnerId)+"&book_id=eq."+encodeURIComponent(book.id)+"&access_origin=eq.partner_grant&limit=1");entitled=er.ok&&(await er.json()).length>0;}
      if(!entitled)return reply({success:false,error:"Cet ouvrage n’est pas encore dans ta bibliothèque."},403);
      const qs=await db("library_quiz_questions?select=id,question_text,question_type,explanation,display_order&quiz_id=eq."+encodeURIComponent(quizId)+"&order=display_order.asc");
      if(!qs.ok)return reply({success:false,error:"Questions indisponibles."},502);
      const questions=await qs.json();
      if(learnerAction==="quiz_get"){
        const safeQuestions=[];
        for(const q of questions){const ar=await db("library_quiz_answers?select=id,answer_text,display_order&question_id=eq."+encodeURIComponent(q.id)+"&order=display_order.asc");safeQuestions.push({...q,answers:ar.ok?await ar.json():[]});}
        return reply({success:true,quiz:{id:quiz.id,title:quiz.title,description:quiz.description,passing_score:quiz.passing_score,questions:safeQuestions}});
      }
      const submitted=body.answers&&typeof body.answers==="object"?body.answers:{};
      let correct=0;const results=[];
      for(const q of questions){
        const ar=await db("library_quiz_answers?select=id,answer_text,is_correct&question_id=eq."+encodeURIComponent(q.id));
        if(!ar.ok)return reply({success:false,error:"Correction temporairement indisponible."},502);
        const answerRows=await ar.json(),expected=answerRows.filter((a:Record<string,any>)=>a.is_correct).map((a:Record<string,any>)=>String(a.id)).sort();
        const raw=submitted[q.id],provided=(Array.isArray(raw)?raw:[raw]).filter((v:unknown)=>v!==undefined&&v!==null&&String(v)!=="").map(String).sort();
        let ok=false;
        if(q.question_type==="short_answer"){
          const expectedText=answerRows.filter((a:Record<string,any>)=>a.is_correct).map((a:Record<string,any>)=>String(a.answer_text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("fr"));
          const entered=String(Array.isArray(raw)?raw[0]??"":raw??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("fr");
          ok=!!entered&&expectedText.includes(entered);
        }else ok=expected.length>0&&expected.length===provided.length&&expected.every((v:string,i:number)=>v===provided[i]);
        if(ok)correct++;
        results.push({question_id:q.id,correct:ok,explanation:q.explanation||null});
      }
      const score=questions.length?Math.round(correct/questions.length*10000)/100:0,passed=score>=Number(quiz.passing_score);
      const save=await db("library_quiz_attempts","POST",{quiz_id:quizId,learner_id:learnerId,score,answers:{submitted:submitted,results},completed_at:new Date().toISOString()},"return=representation");
      if(!save.ok)return reply({success:false,error:"Impossible d’enregistrer ton résultat."},502);
      return reply({success:true,score,passed,passing_score:Number(quiz.passing_score),correct,total:questions.length,results,attempt:(await save.json())[0]});
    }
    if(learnerAction==="progress_save"){
      const bookId=String(body.book_id??""),progress=Math.max(0,Math.min(100,Number(body.progress_percent??0)));
      if(!/^[0-9a-f-]{36}$/i.test(bookId))return reply({success:false,error:"Ouvrage invalide."},400);
      const access=await db("learner_library_books?select=id&learner_id=eq."+encodeURIComponent(learnerId)+"&book_id=eq."+encodeURIComponent(bookId)+"&limit=1");
      if(!access.ok||(await access.json()).length!==1)return reply({success:false,error:"Accès à cet ouvrage non confirmé."},403);
      const saved=await db("library_reading_progress?on_conflict=learner_id,book_id","POST",{learner_id:learnerId,book_id:bookId,progress_percent:progress,current_location:body.current_location??{},last_opened_at:new Date().toISOString(),completed_at:progress>=100?new Date().toISOString():null},"resolution=merge-duplicates,return=representation");
      if(!saved.ok)return reply({success:false,error:"Progression non enregistrée."},502);
      return reply({success:true,progress_percent:progress});
    }
    const bookId=String(body?.book_id??"");const accessAction=String(body?.action??"open");
    if(!/^[0-9a-f-]{36}$/i.test(bookId))return reply({success:false,error:"Livre invalide."},400);
    const br=await db("library_books?select=id,title,slug,access_mode,product_id,status&id=eq."+bookId+"&status=eq.published&limit=1");
    const book=(await br.json().catch(()=>[]))?.[0];if(!br.ok||!book)return reply({success:false,error:"Livre introuvable."},404);
    const lr=await db("library_licenses?select=id,allow_online_reading,allow_download,status,valid_from,valid_until&book_id=eq."+bookId+"&status=eq.active");
    const licenses=lr.ok?await lr.json():[];
    const today=new Date().toISOString().slice(0,10);
    const license=licenses.find((l:Record<string,any>)=>(!l.valid_from||l.valid_from<=today)&&(!l.valid_until||l.valid_until>=today));
    if(!license)return reply({success:false,error:"Les droits de diffusion de ce livre ne sont pas encore validés."},403);
    const access=book.access_mode==="free";
    let entitled=access;
    if(book.access_mode==="paid"){
      const er=await db("learner_entitlements?select=id&learner_id=eq."+encodeURIComponent(userId)+"&product_id=eq."+encodeURIComponent(book.product_id??"")+"&status=eq.active");
      entitled=!!book.product_id&&er.ok&&(await er.json()).length>0;
    }
    if(book.access_mode==="partner"){
      const er=await db("learner_library_books?select=id&learner_id=eq."+encodeURIComponent(userId)+"&book_id=eq."+encodeURIComponent(bookId)+"&access_origin=eq.partner_grant&limit=1");
      entitled=er.ok&&(await er.json()).length>0;
    }
    if(!entitled)return reply({success:false,error:"Ce livre n’est pas encore dans ta bibliothèque. Achète-le pour y accéder.",product_id:book.product_id},403);
    if(accessAction!=="open"&&accessAction!=="download")return reply({success:false,error:"Action inconnue."},400);
    if(accessAction==="open"&&!license.allow_online_reading)return reply({success:false,error:"La lecture en ligne n’est pas autorisée pour ce livre."},403);
    if(accessAction==="download"&&!license.allow_download)return reply({success:false,error:"Le téléchargement n’est pas autorisé pour ce livre."},403);
    const fr=await db("library_files?select=id,file_kind,storage_path,file_name,mime_type,allow_online_reading,allow_download,is_primary&book_id=eq."+bookId+"&order=is_primary.desc,display_order.asc");
    if(!fr.ok)return reply({success:false,error:"Fichiers indisponibles."},502);
    const files=await fr.json(),file=files.find((f:Record<string,any>)=>accessAction==="open"?f.allow_online_reading&&["pdf","epub"].includes(f.file_kind):f.allow_download&&["pdf","epub"].includes(f.file_kind));
    if(!file)return reply({success:false,error:"Aucun fichier compatible avec ce mode d’accès."},404);
    const url=await signed(file.storage_path,accessAction==="download");
    await db("learner_library_books?on_conflict=learner_id,book_id","POST",{learner_id:userId,book_id:bookId,access_origin:access?"free":book.access_mode==="partner"?"partner_grant":"purchase"},"resolution=merge-duplicates");
    return reply({success:true,url,file_name:file.file_name??book.title,file_kind:file.file_kind,mode:accessAction,expires_in:180});
  }catch(e){console.error("library api",e instanceof Error?e.message:String(e));return reply({success:false,error:e instanceof Error?e.message:"Erreur interne."},500);}
});
