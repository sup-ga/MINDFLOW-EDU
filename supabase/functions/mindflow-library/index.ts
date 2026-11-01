import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUBLIC = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const BUCKET = "mindflow-products";
const headers = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, apikey, authorization","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
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
async function adminAllowed(req:Request){
  const token=(req.headers.get("Authorization")??"").replace(/^Bearer\\s+/i,"");
  if(!token)return false;
  const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/is_professional_reviewer",{method:"POST",headers:{apikey:PUBLIC||SERVICE,Authorization:"Bearer "+token,"Content-Type":"application/json"},body:"{}"});
  if(!r.ok)return false;
  return await r.json()===true;
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
        endpoint="library_books?select=id,slug,title,subtitle,author_name,description,book_type,access_mode,product_id,cover_path,learner_library_books!inner(learner_id,added_at)&learner_library_books.learner_id=eq."+userId+"&status=eq.published&order=title.asc";
      }
      const b=await db(endpoint);
      if(!b.ok)return reply({success:false,error:"Impossible de charger les livres."},502);
      let books=await b.json();
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
      if(!await adminAllowed(req))return reply({success:false,error:"Accès réservé à l’équipe administrative autorisée."},403);
      if(action==="admin_list"){
        const tables=["library_books?select=*&order=updated_at.desc","library_partners?select=*&order=display_name.asc","library_licenses?select=*&order=created_at.desc","library_files?select=*&order=created_at.desc","library_categories?select=*&order=display_order.asc"];
        const results=await Promise.all(tables.map(db));
        if(results.some(r=>!r.ok))return reply({success:false,error:"Impossible de charger les données administratives."},502);
        const [books,partners,licenses,files,categories]=await Promise.all(results.map(r=>r.json()));
        return reply({success:true,books,partners,licenses,files,categories});
      }
      if(action==="admin_save_book"){
        const x=body.book??{};
        const payload={...(x.id?{id:x.id}:{}),slug:String(x.slug??"").trim(),title:String(x.title??"").trim(),author_name:String(x.author_name??"").trim(),description:String(x.description??""),publisher_name:x.publisher_name||null,publication_year:x.publication_year?Number(x.publication_year):null,isbn:x.isbn||null,language:x.language||"fr",country_of_origin:x.country_of_origin||"GA",book_type:x.book_type||"literary_work",access_mode:x.access_mode||"paid",status:x.status||"draft",featured:!!x.featured,cover_path:x.cover_path||null,product_id:x.product_id||null,updated_at:new Date().toISOString()};
        if(!payload.slug||!payload.title||!payload.author_name)return reply({success:false,error:"Titre, auteur et identifiant URL obligatoires."},400);
        const r=await db("library_books?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement du livre impossible."},400);
        return reply({success:true,book:(await r.json())[0]});
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
        const r=await db("library_licenses?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement des droits impossible."},400);
        return reply({success:true,license:(await r.json())[0]});
      }
      if(action==="admin_save_file"){
        const x=body.file??{},payload={...(x.id?{id:x.id}:{}),book_id:x.book_id,file_kind:x.file_kind||"pdf",storage_path:String(x.storage_path??"").trim(),file_name:x.file_name||null,mime_type:x.mime_type||null,allow_online_reading:!!x.allow_online_reading,allow_download:!!x.allow_download,is_primary:!!x.is_primary,display_order:Number(x.display_order||100)};
        if(!payload.book_id||!payload.storage_path)return reply({success:false,error:"Livre et chemin de stockage obligatoires."},400);
        const r=await db("library_files?on_conflict=id","POST",payload,"resolution=merge-duplicates,return=representation");
        if(!r.ok)return reply({success:false,error:"Enregistrement du fichier impossible."},400);
        return reply({success:true,file:(await r.json())[0]});
      }
      return reply({success:false,error:"Action administrative inconnue."},400);
    }
    const userId=await identify(req);if(!userId)return reply({success:false,error:"Connecte-toi pour accéder à ce livre."},401);
    const bookId=String(body?.book_id??""),action=String(body?.action??"open");
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
    if(!entitled){
      const er=await db("learner_library_books?select=id&learner_id=eq."+userId+"&book_id=eq."+bookId+"&limit=1");
      entitled=er.ok&&(await er.json()).length>0;
    }
    if(!entitled)return reply({success:false,error:"Ce livre n’est pas encore dans ta bibliothèque. Achète-le pour y accéder.",product_id:book.product_id},403);
    if(action!=="open"&&action!=="download")return reply({success:false,error:"Action inconnue."},400);
    if(action==="open"&&!license.allow_online_reading)return reply({success:false,error:"La lecture en ligne n’est pas autorisée pour ce livre."},403);
    if(action==="download"&&!license.allow_download)return reply({success:false,error:"Le téléchargement n’est pas autorisé pour ce livre."},403);
    const fr=await db("library_files?select=id,file_kind,storage_path,file_name,mime_type,allow_online_reading,allow_download,is_primary&book_id=eq."+bookId+"&order=is_primary.desc,display_order.asc");
    if(!fr.ok)return reply({success:false,error:"Fichiers indisponibles."},502);
    const files=await fr.json(),file=files.find((f:Record<string,any>)=>action==="open"?f.allow_online_reading&&["pdf","epub"].includes(f.file_kind):f.allow_download&&["pdf","epub"].includes(f.file_kind));
    if(!file)return reply({success:false,error:"Aucun fichier compatible avec ce mode d’accès."},404);
    const url=await signed(file.storage_path,action==="download");
    await db("learner_library_books?on_conflict=learner_id,book_id","POST",{learner_id:userId,book_id:bookId,access_origin:access?"free":"purchase"},"resolution=merge-duplicates");
    return reply({success:true,url,file_name:file.file_name??book.title,file_kind:file.file_kind,mode:action,expires_in:180});
  }catch(e){console.error("library api",e instanceof Error?e.message:String(e));return reply({success:false,error:e instanceof Error?e.message:"Erreur interne."},500);}
});
